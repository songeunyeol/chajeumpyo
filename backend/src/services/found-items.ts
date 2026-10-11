import { randomUUID } from "node:crypto";
import type { FoundItemExtraction, RegisterFoundItemFields, RegisterFoundItemResponse } from "@chajeumpyo/shared";
import { ai } from "../ai";
import { env } from "../config/env";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { hmac } from "../lib/hash";
import { makePublicImage, normalizeImage } from "../lib/image";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { setFoundItemEmbedding } from "../repositories/embedding";
import { storage } from "../storage";

/** 비회원 등록 제한: 같은 지문으로 10분에 5건 (초안, F-01) */
export const REGISTER_LIMIT = { windowMinutes: 10, count: 5 };

export const REVIEW_MESSAGE = "분석이 늦어져서 관리자가 확인한 뒤 등록돼요.";

/** 습득자 기기·IP 지문. 원문은 저장하지 않고 서버 키로 HMAC한 값만 남긴다. */
export function uploaderFingerprint(ip: string, userAgent: string): string {
  return hmac(`uploader:${ip}:${userAgent}`);
}

type Analysis = { extraction: FoundItemExtraction; embedding: number[] };

/** AI 속성 추출 + 설명 임베딩. 각각 시간 제한을 두고 실패하면 한 번 재시도한다. 끝내 실패하면 null. */
async function analyze(image: Buffer): Promise<Analysis | null> {
  try {
    const extraction = await retryOnce(() =>
      withTimeout(ai.extractFoundItem(image, "image/jpeg"), env.AI_TIMEOUT_MS, "속성 추출"),
    );
    if (!extraction.hasObject) return { extraction, embedding: [] };
    const embedding = await retryOnce(() => withTimeout(ai.embed(extraction.description), env.AI_TIMEOUT_MS, "임베딩"));
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
  const analysis = await analyze(original);
  if (analysis && !analysis.extraction.hasObject) {
    throw new AppError("NO_OBJECT_DETECTED", "사진에서 물건을 찾지 못했어요. 물건이 잘 보이게 다시 찍어 주세요.");
  }

  const ex = analysis?.extraction;
  // AI가 실패해 민감 여부를 모르면 흐리게 처리하는 쪽이 기본 (F-03)
  const blur = ex ? ex.isSensitive : true;
  const id = randomUUID();
  const keys = { original: `found/${id}/original.jpg`, public: `found/${id}/public.jpg` };
  await storage.put(keys.original, original, "image/jpeg");
  await storage.put(keys.public, await makePublicImage(original, blur), "image/jpeg");

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
          status,
          uploaderFingerprint: fingerprint,
          foundAt,
          expiresAt: new Date(foundAt.getTime() + env.FOUND_ITEM_RETENTION_DAYS * 86_400_000),
          detail: {
            create: {
              imageOriginalKey: keys.original,
              imagePublicKey: keys.public,
              isSensitive: blur,
              color: ex?.color ?? null,
              brand: ex?.brand ?? null,
              features: ex?.features ?? [],
              description: ex?.description ?? null,
              rawAiResponse: ex ?? undefined,
            },
          },
        },
      });
      if (analysis) await setFoundItemEmbedding(id, analysis.embedding, tx);
    });
  } catch (err) {
    await Promise.all([storage.delete(keys.original), storage.delete(keys.public)]);
    throw err;
  }

  // TODO(F-13): 등록되면 조건이 맞는 열린 신고에 알림 만들기

  return {
    id,
    status,
    category: ex?.category ?? null,
    building,
    storageType: fields.storageType,
    storagePlace: place,
    message: analysis ? null : REVIEW_MESSAGE,
  };
}
