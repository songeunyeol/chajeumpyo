import { randomUUID } from "node:crypto";
import {
  type Category,
  FoundItemExtraction,
  type RegisterFoundItemFields,
  type RegisterFoundItemResponse,
  VALUABLE_CATEGORIES,
} from "@chajeumpyo/shared";
import { ai, EMBEDDING_DIM } from "../ai";
import { env } from "../config/env";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { hmac } from "../lib/hash";
import { makePublicImage, makeThumbImage, normalizeImage } from "../lib/image";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { premaskSafely } from "../privacy/premask";
import { setFoundItemEmbedding } from "../repositories/embedding";
import { storage } from "../storage";
import { listStoragePlaces } from "./buildings";
import { alertNewCandidateSafely } from "./candidate-alerts";

/** 비회원 등록 제한: 같은 지문으로 10분에 5건 (초안, F-01) */
export const REGISTER_LIMIT = { windowMinutes: 10, count: 5 };

export const REVIEW_MESSAGE = "분석이 늦어져서 관리자가 확인한 뒤 등록돼요.";
export const HAND_OVER_MESSAGE = "귀중품이에요. 잃어버린 사람이 안전하게 찾을 수 있게 가까운 보관처에 맡겨 주세요.";
/** 고가품 안내에 보여 줄 보관처 수 */
const HAND_OVER_SUGGESTIONS = 3;

/**
 * 고가품을 그 자리에 두면 보관처에 맡겨 달라고 안내한다 (open-issues #32 P0 단계, QA B11).
 * 등록 전에는 종류를 몰라 막을 수 없으므로 완료 응답에서 안내하고, 등록 단계 차단은 P1(두 단계 등록)에서 한다.
 */
async function handOverAdvice(category: Category | null, storageType: string, buildingId: number) {
  if (!category || storageType !== "IN_PLACE" || !VALUABLE_CATEGORIES.includes(category)) return null;
  const places = await listStoragePlaces(buildingId);
  return {
    message: HAND_OVER_MESSAGE,
    storagePlaces: places.slice(0, HAND_OVER_SUGGESTIONS).map((p) => ({
      id: p.id,
      name: p.name,
      guideText: p.guideText,
      building: p.building,
      sameBuilding: p.sameBuilding,
    })),
  };
}

/** 습득자 기기·IP 지문. 원문은 저장하지 않고 서버 키로 HMAC한 값만 남긴다. */
export function uploaderFingerprint(ip: string, userAgent: string): string {
  return hmac(`uploader:${ip}:${userAgent}`);
}

type Analysis = { extraction: FoundItemExtraction; embedding: number[] };

/** 임베딩은 정해진 차원의 유한한 숫자여야 한다 */
export function isValidEmbedding(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === EMBEDDING_DIM && v.every((x) => typeof x === "number" && Number.isFinite(x));
}

/**
 * AI 속성 추출 + 설명 임베딩. 각각 시간 제한을 두고 실패하면 한 번 재시도한다.
 * AI 응답은 고정 계약(zod)으로 다시 검증한다. 형식이 틀리면(허용값 밖 색·종류, 특징 5개 이상 등) 실패로 보고 검토 대기로 저장한다.
 * 끝내 실패하면 null.
 */
async function analyze(image: Buffer): Promise<Analysis | null> {
  try {
    const raw = await retryOnce(() =>
      withTimeout(ai.extractFoundItem(image, "image/jpeg"), env.AI_TIMEOUT_MS, "속성 추출"),
    );
    const parsed = FoundItemExtraction.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "습득물 AI 응답 형식 오류 → 검토 대기로 저장");
      return null;
    }
    const extraction = parsed.data;
    if (!extraction.hasObject) return { extraction, embedding: [] };
    const embedding = await retryOnce(() => withTimeout(ai.embed(extraction.description), env.AI_TIMEOUT_MS, "임베딩"));
    if (!isValidEmbedding(embedding as unknown)) {
      logger.warn({ length: (embedding as unknown[]).length }, "임베딩 형식 오류 → 검토 대기로 저장");
      return null;
    }
    return { extraction, embedding };
  } catch (err) {
    logger.warn({ err }, "습득물 AI 분석 실패 → 검토 대기로 저장");
    return null;
  }
}

/** POST /found-items (F-01, F-02, F-03) */
export async function registerFoundItem(input: {
  image: Buffer;
  fields: RegisterFoundItemFields;
  fingerprint: string;
}): Promise<RegisterFoundItemResponse> {
  const { fields, fingerprint } = input;

  const since = new Date(Date.now() - REGISTER_LIMIT.windowMinutes * 60_000);
  const recent = await prisma.foundItem.count({ where: { uploaderFingerprint: fingerprint, foundAt: { gte: since } } });
  if (recent >= REGISTER_LIMIT.count) {
    throw new AppError("RATE_LIMITED", "짧은 시간에 너무 많이 등록했어요. 잠시 후 다시 시도해 주세요.");
  }

  const building = await prisma.building.findUnique({
    where: { id: fields.buildingId },
    select: { id: true, name: true },
  });
  if (!building)
    throw new AppError("VALIDATION_ERROR", "건물을 다시 골라 주세요.", [{ path: "buildingId", message: "없는 건물" }]);
  const place = fields.storagePlaceId
    ? await prisma.storagePlace.findFirst({
        where: { id: fields.storagePlaceId, isActive: true },
        select: { id: true, name: true, guideText: true },
      })
    : null;
  if (fields.storagePlaceId && !place) {
    throw new AppError("VALIDATION_ERROR", "보관처를 다시 골라 주세요.", [
      { path: "storagePlaceId", message: "없거나 운영하지 않는 보관처" },
    ]);
  }

  const original = await normalizeImage(input.image);
  // 얼굴·글자 영역을 먼저 가린 사본만 AI로 보내고 공개본·후보용 사본도 이것으로 만든다 (QA B3, T4).
  // 가리기에 실패하면 원본을 보내지 않고 AI 없이 검토 대기로 저장한다. 원본은 관리자만 본다.
  const masked = await premaskSafely(original);
  if (masked && (masked.faces || masked.texts)) {
    logger.info({ faces: masked.faces, texts: masked.texts }, "AI 전송 전 가림");
  }
  const analysis = masked ? await analyze(masked.image) : null;
  if (analysis && !analysis.extraction.hasObject) {
    throw new AppError("NO_OBJECT_DETECTED", "사진에서 물건을 찾지 못했어요. 물건이 잘 보이게 다시 찍어 주세요.");
  }

  const ex = analysis?.extraction;
  // AI가 실패해 민감 여부를 모르면 흐리게 처리하는 쪽이 기본 (F-03)
  const sensitive = ex ? ex.isSensitive : true;
  const id = randomUUID();
  const keys = {
    original: `found/${id}/original.jpg`,
    public: `found/${id}/public.jpg`,
    thumb: `found/${id}/thumb.jpg`,
  };
  const [publicImage, thumbImage] = await Promise.all([
    makePublicImage(masked?.image ?? original, { sensitive, regions: ex?.sensitiveRegions ?? [] }),
    makeThumbImage(masked?.image ?? original),
  ]);
  await storage.put(keys.original, original, "image/jpeg");
  await storage.put(keys.public, publicImage, "image/jpeg");
  await storage.put(keys.thumb, thumbImage, "image/jpeg");

  const foundAt = new Date();
  const status = analysis ? "REGISTERED" : "REVIEW";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.foundItem.create({
        data: {
          id,
          buildingId: building.id,
          category: ex?.category ?? null,
          categoryAlt: ex?.categoryAlt && ex.categoryAlt !== ex.category ? ex.categoryAlt : null,
          storageType: fields.storageType,
          storagePlaceId: place?.id ?? null,
          floor: fields.floor ?? null,
          consentVersion: fields.consentVersion,
          locationConsent: fields.consentLocation,
          status,
          uploaderFingerprint: fingerprint,
          foundAt,
          expiresAt: new Date(foundAt.getTime() + env.FOUND_ITEM_RETENTION_DAYS * 86_400_000),
          detail: {
            create: {
              imageOriginalKey: keys.original,
              imagePublicKey: keys.public,
              imageThumbKey: keys.thumb,
              isSensitive: sensitive,
              color: ex?.color ?? null,
              brand: ex?.brand ?? null,
              features: ex?.features ?? [],
              description: ex?.description ?? null,
              title: ex?.title ?? null,
              rawAiResponse: ex ?? undefined,
            },
          },
        },
      });
      if (analysis) await setFoundItemEmbedding(id, analysis.embedding, tx);
    });
  } catch (err) {
    await Promise.all([storage.delete(keys.original), storage.delete(keys.public), storage.delete(keys.thumb)]);
    throw err;
  }

  if (status === "REGISTERED") await alertNewCandidateSafely(id);

  return {
    id,
    status,
    category: ex?.category ?? null,
    building,
    floor: fields.floor ?? null,
    storageType: fields.storageType,
    storagePlace: place,
    message: analysis ? null : REVIEW_MESSAGE,
    handOverAdvice: await handOverAdvice(ex?.category ?? null, fields.storageType, building.id),
  };
}
