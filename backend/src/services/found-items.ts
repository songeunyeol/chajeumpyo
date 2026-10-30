import { randomBytes, randomUUID } from "node:crypto";
import {
  AiFeature,
  type AnalyzeFoundItemFields,
  type AnalyzeFoundItemResponse,
  type Category,
  type ConfirmFoundItemBody,
  FoundItemExtraction,
  itemLabel,
  LostReportExtraction,
  MAX_FEATURES,
  type RegisterFoundItemFields,
  type RegisterFoundItemResponse,
  type SensitiveRegion,
  subCategoryWithin,
  VALUABLE_CATEGORIES,
} from "@chajeumpyo/shared";
import { z } from "zod";
import { ai, EMBEDDING_DIM } from "../ai";
import { env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { hmac } from "../lib/hash";
import { makePublicImage, makeThumbImage, normalizeImage } from "../lib/image";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { premaskSafely } from "../privacy/premask";
import { setFoundItemEmbedding } from "../repositories/embedding";
import { storage } from "../storage";
import { adminAlertSafely, alertItemIncoming, alertValuableInPlace } from "./admin-alerts";
import { alertNewCandidateSafely } from "./candidate-alerts";
import { alertHotspotSafely } from "./hotspots";

/** 비회원 등록 제한: 같은 지문으로 10분에 5건 (초안, F-01) */
export const REGISTER_LIMIT = { windowMinutes: 10, count: 5 };
/** 두 단계 등록에서 분석 뒤 확정을 기다리는 시간. 지나면 정기 작업이 기한 만료로 지운다 */
export const DRAFT_TTL_MINUTES = 60;

export const REVIEW_MESSAGE = "분석이 늦어져서 관리자가 확인한 뒤 등록돼요.";

/**
 * 귀중품 여부(화면의 보관처 추천용). 귀중품도 그 자리에 둘 수 있다 (10/30 팀 결정, QA B11 정책 변경).
 * 막으면 "3초 등록"이 어려워 아예 안 올리게 되므로, 화면이 보관처를 추천만 하고 그 자리에 둔 귀중품은 교무처에 알린다.
 */
export function isValuableCategory(category: Category | null | undefined): boolean {
  return !!category && VALUABLE_CATEGORIES.includes(category);
}

/** 습득자 기기·IP 지문. 원문은 저장하지 않고 서버 키로 HMAC한 값만 남긴다. */
/** 이름·번호·얼굴 사진이 들어가는 카드. AI가 이 종류로 보면 공개 사진은 통째로 흐린다 */
const CARD_CATEGORIES: Category[] = ["ID_CARD", "DRIVER_LICENSE", "PAYMENT_CARD", "TRANSIT_CARD", "OTHER_CARD"];

/**
 * 공개 사진 흐리기 기준 (2단계 가리기). 서버 안 1단계 가리기가 작은·기울어진·세로 글자 줄이나 사진 속 얼굴을 놓칠 수 있어서
 * (10/30 커뮤니티 실제 사진 점검: 개인정보 사진 7장 중 4장 일부 남음), 카드로 분류된 물건은 AI가 알려 준 영역만이 아니라 사진 전체를 흐린다.
 * AI가 실패해 민감 여부를 모르면 흐리게 처리하는 쪽이 기본 (F-03)
 */
export function publicPrivacy(
  ex: { isSensitive: boolean; category: Category; sensitiveRegions: SensitiveRegion[] } | null,
) {
  if (!ex) return { sensitive: true, regions: [] };
  if (CARD_CATEGORIES.includes(ex.category)) return { sensitive: true, regions: [] };
  return { sensitive: ex.isSensitive, regions: ex.sensitiveRegions };
}

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

/** 같은 지문으로 짧은 시간에 너무 많이 올리면 막는다. 두 단계 등록의 분석(초안)도 센다 */
async function checkRegisterLimit(fingerprint: string) {
  const since = new Date(Date.now() - REGISTER_LIMIT.windowMinutes * 60_000);
  const recent = await prisma.foundItem.count({ where: { uploaderFingerprint: fingerprint, foundAt: { gte: since } } });
  if (recent >= REGISTER_LIMIT.count) {
    throw new AppError("RATE_LIMITED", "짧은 시간에 너무 많이 등록했어요. 잠시 후 다시 시도해 주세요.");
  }
}

type PlaceFields = Pick<RegisterFoundItemFields, "buildingId" | "storagePlaceId">;

/** 고른 건물·보관처가 실제로 있는지 본다. 보관처에 맡겼고 주운 건물을 모르면 건물은 null */
async function resolvePlace(fields: PlaceFields) {
  const building = fields.buildingId
    ? await prisma.building.findUnique({ where: { id: fields.buildingId }, select: { id: true, name: true } })
    : null;
  if (fields.buildingId && !building)
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
  return { building, place };
}

type ProcessedPhoto = {
  id: string;
  keys: { original: string; public: string; thumb: string };
  analysis: Analysis | null;
  sensitive: boolean;
  /** 서버 안 가리기에 성공했는지. 실패했으면 습득자 설명으로도 자동 등록하지 않는다 */
  premasked: boolean;
};

/**
 * 사진을 정리하고, 가린 사본으로 AI 분석을 한 뒤 원본·공개본·후보용 사본을 저장한다.
 * 물건이 없다고 분석되면 아무것도 저장하지 않고 NO_OBJECT_DETECTED.
 */
async function processPhoto(image: Buffer): Promise<ProcessedPhoto> {
  const original = await normalizeImage(image);
  // 얼굴·글자 영역을 먼저 가린 사본만 AI로 보내고 공개본·후보용 사본도 이것으로 만든다 (QA B3, T4).
  // 가리기에 실패하면 원본을 보내지 않고 AI 없이 검토 대기로 저장한다. 원본은 관리자만 본다.
  // 저장하는 원본도 가린 사본으로 둔다 (QA B3 결정 10/29). 가리기에 실패했을 때만 가리지 않은 원본이 남는다(검토 대기, 관리자만).
  const masked = await premaskSafely(original);
  if (masked && (masked.faces || masked.texts)) {
    logger.info({ faces: masked.faces, texts: masked.texts }, "AI 전송 전 가림");
  }
  const analysis = masked ? await analyze(masked.image) : null;
  if (analysis && !analysis.extraction.hasObject) {
    throw new AppError("NO_OBJECT_DETECTED", "사진에서 물건을 찾지 못했어요. 물건이 잘 보이게 다시 찍어 주세요.");
  }

  const ex = analysis?.extraction;
  const privacy = publicPrivacy(ex ?? null);
  const sensitive = privacy.sensitive;
  const id = randomUUID();
  const keys = {
    original: `found/${id}/original.jpg`,
    public: `found/${id}/public.jpg`,
    thumb: `found/${id}/thumb.jpg`,
  };
  const [publicImage, thumbImage] = await Promise.all([
    makePublicImage(masked?.image ?? original, privacy),
    makeThumbImage(masked?.image ?? original),
  ]);
  await storage.put(keys.original, masked?.image ?? original, "image/jpeg");
  await storage.put(keys.public, publicImage, "image/jpeg");
  await storage.put(keys.thumb, thumbImage, "image/jpeg");
  return { id, keys, analysis, sensitive, premasked: !!masked };
}

/** 저장한 사진과 AI 결과로 습득물 행을 만든다. 실패하면 올린 사진을 지운다 */
async function createFoundItem(
  photo: ProcessedPhoto,
  data: Omit<Prisma.FoundItemUncheckedCreateInput, "id" | "category" | "categoryAlt" | "subCategory" | "detail">,
  locationDetail: string | null,
) {
  const { id, keys, analysis, sensitive, premasked } = photo;
  const ex = analysis?.extraction;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.foundItem.create({
        data: {
          ...data,
          id,
          category: ex?.category ?? null,
          categoryAlt: ex?.categoryAlt && ex.categoryAlt !== ex.category ? ex.categoryAlt : null,
          subCategory: ex ? subCategoryWithin(ex.category, ex.subCategory) : null,
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
              locationDetail,
              // 분석에 실패하면 가리기 성공 여부만 남긴다. 확정 때 습득자 설명으로 종류를 정해도 되는지 본다
              rawAiResponse: ex ?? { analysisFailed: true, premasked },
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
}

/** POST /found-items (F-01, F-02, F-03): 사진과 위치를 한 번에 받아 등록한다 */
export async function registerFoundItem(input: {
  image: Buffer;
  fields: RegisterFoundItemFields;
  fingerprint: string;
}): Promise<RegisterFoundItemResponse> {
  const { fields, fingerprint } = input;
  await checkRegisterLimit(fingerprint);
  const { building, place } = await resolvePlace(fields);
  const photo = await processPhoto(input.image);

  const foundAt = new Date();
  const status = photo.analysis ? "REGISTERED" : "REVIEW";
  await createFoundItem(
    photo,
    {
      buildingId: building?.id ?? null,
      storageType: fields.storageType,
      storagePlaceId: place?.id ?? null,
      floor: fields.floor ?? null,
      consentVersion: fields.consentVersion,
      locationConsent: fields.consentLocation,
      status,
      uploaderFingerprint: fingerprint,
      foundAt,
      expiresAt: new Date(foundAt.getTime() + env.FOUND_ITEM_RETENTION_DAYS * 86_400_000),
    },
    fields.locationDetail ?? null,
  );

  if (status === "REGISTERED") {
    await alertNewCandidateSafely(photo.id);
    await alertHotspotSafely(photo.id);
  }
  await adminAlertSafely(() => alertItemIncoming(photo.id), photo.id, "ITEM_INCOMING");
  await adminAlertSafely(() => alertValuableInPlace(photo.id), photo.id, "VALUABLE_IN_PLACE");

  const category = photo.analysis?.extraction.category ?? null;
  return {
    id: photo.id,
    status,
    category,
    subCategory: subCategoryWithin(category, photo.analysis?.extraction.subCategory),
    building,
    floor: fields.floor ?? null,
    storageType: fields.storageType,
    storagePlace: place,
    message: photo.analysis ? null : REVIEW_MESSAGE,
    // 고가품을 그 자리에 두는 등록은 이제 거절하므로 늘 null. 응답 호환을 위해 필드만 남긴다
    handOverAdvice: null,
  };
}

/**
 * POST /found-items/analyze: 두 단계 등록의 1단계. 사진만 먼저 받아 분석하고 확정 전(ANALYZING)으로 저장한다.
 * 확정 전에는 후보·알림·관리자 등록 처리에 나오지 않고, 기한(DRAFT_TTL_MINUTES)이 지나면 정기 작업이 사진까지 지운다.
 */
export async function analyzeFoundItem(input: {
  image: Buffer;
  fields: AnalyzeFoundItemFields;
  fingerprint: string;
}): Promise<AnalyzeFoundItemResponse> {
  const { fields, fingerprint } = input;
  await checkRegisterLimit(fingerprint);
  const photo = await processPhoto(input.image);

  const now = new Date();
  const confirmBy = new Date(now.getTime() + DRAFT_TTL_MINUTES * 60_000);
  const confirmToken = randomBytes(32).toString("base64url");
  await createFoundItem(
    photo,
    {
      consentVersion: fields.consentVersion,
      locationConsent: fields.consentLocation,
      status: "ANALYZING",
      uploaderFingerprint: fingerprint,
      foundAt: now,
      expiresAt: confirmBy,
      confirmTokenHash: hmac(`found-confirm:${confirmToken}`),
    },
    null,
  );

  const category = photo.analysis?.extraction.category ?? null;
  return {
    id: photo.id,
    confirmToken,
    category,
    subCategory: subCategoryWithin(category, photo.analysis?.extraction.subCategory),
    isValuable: isValuableCategory(category),
    message: photo.analysis ? null : REVIEW_MESSAGE,
    confirmBy: confirmBy.toISOString(),
  };
}

/** 습득자 설명에서 빼는 개인정보 숫자: 메일, 전화번호, 7자리 이상 숫자(학번·카드번호) */
const NOTE_PII = [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, /\d[\d\s.-]{5,}\d/g];

/** 습득자 설명을 저장할 수 있게 다듬는다. 개인정보 숫자를 지우고, 남는 글이 없으면 null */
export function scrubFinderNote(note: string | undefined): string | null {
  if (!note) return null;
  let text = note;
  for (const re of NOTE_PII) text = text.replace(re, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.length >= 2 ? text : null;
}

/** 습득자 설명에서 나온 특징. 출처를 남겨 관리자·평가에서 AI가 사진에서 본 것과 구분한다 */
type NoteFeature = AiFeature & { source: "finder" };

/** 습득자 설명을 분석한다(분실 신고 설명과 같은 분석기). 실패하면 null이고 설명은 글로만 남긴다 */
async function analyzeNote(note: string): Promise<LostReportExtraction | null> {
  try {
    const raw = await retryOnce(() => withTimeout(ai.extractLostReport(note), env.AI_TIMEOUT_MS, "습득자 설명 분석"));
    const parsed = LostReportExtraction.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    logger.warn({ err }, "습득자 설명 분석 실패 → 설명은 글로만 저장");
    return null;
  }
}

async function embedOrNull(text: string): Promise<number[] | null> {
  try {
    const v = await retryOnce(() => withTimeout(ai.embed(text), env.AI_TIMEOUT_MS, "임베딩"));
    return isValidEmbedding(v as unknown) ? v : null;
  } catch (err) {
    logger.warn({ err }, "습득자 설명 임베딩 실패");
    return null;
  }
}

/** 습득자 설명에서는 받지 않는 특징 종류. 글자·각인은 이름·이니셜일 수 있다 (10/30 코드 평가) */
const NOTE_DROPPED_KEYS = new Set<AiFeature["key"]>(["text"]);

/**
 * 사진 특징 뒤에 설명 특징을 붙인다. 같은 값은 한 번만.
 * 설명 특징(source: "finder")은 주인 확인 대조에 쓰고, 객관식 질문에는 안전한 종류만 낸다(claims.ts finderFeatureIds).
 */
function mergeFeatures(stored: AiFeature[], fromNote: AiFeature[]): AiFeature[] {
  const seen = new Set(stored.map((f) => f.value.replace(/\s/g, "")));
  const added: NoteFeature[] = [];
  for (const f of fromNote) {
    if (NOTE_DROPPED_KEYS.has(f.key)) continue;
    const k = f.value.replace(/\s/g, "");
    if (seen.has(k)) continue;
    seen.add(k);
    added.push({ ...f, source: "finder" });
  }
  return [...stored, ...added].slice(0, MAX_FEATURES + 2);
}

/**
 * 확정 전에 습득자 설명으로 할 일을 정한다(AI 호출은 트랜잭션 밖에서).
 * - 사진 분석에 성공한 초안: 설명 특징을 덧붙이고, 임베딩을 "AI 설명 + 습득자 설명"으로 다시 만든다.
 * - 사진 분석에 실패한 초안: 서버 안 가리기에 성공했고 설명으로 종류를 알 수 있으면 그 종류로 등록한다(텍스트 분류).
 *   종류를 모르거나(ETC이고 특징도 없음) 가리기에 실패했으면 지금처럼 관리자 검토(REVIEW).
 */
async function planNote(id: string, note: string | null, fixLabel: string | null) {
  if (!note) return null;
  const draft = await prisma.foundItem.findFirst({
    where: { id, status: "ANALYZING" },
    select: { category: true, detail: { select: { description: true, features: true, rawAiResponse: true } } },
  });
  if (!draft) return null;
  const ex = await analyzeNote(note);
  const fromNote = ex?.features ?? [];
  const storedFeatures = z.array(AiFeature).catch([]).parse(draft.detail?.features);

  if (draft.category) {
    const base = fixLabel ?? draft.detail?.description ?? "";
    const embedding = await embedOrNull(`${base} ${note}`.trim());
    return {
      kind: "enrich" as const,
      features: mergeFeatures(storedFeatures, fromNote),
      color: ex?.color ?? null,
      brand: ex?.brand ?? null,
      embedding,
    };
  }

  const raw = draft.detail?.rawAiResponse as { premasked?: boolean } | null;
  const known = ex && (ex.category !== "ETC" || ex.features.length > 0);
  if (!ex || !known || raw?.premasked !== true) return { kind: "noteOnly" as const };
  const description = ex.description || note;
  const embedding = await embedOrNull(description);
  if (!embedding) return { kind: "noteOnly" as const };
  const subCategory = subCategoryWithin(ex.category, ex.subCategory);
  return {
    kind: "classify" as const,
    category: ex.category,
    subCategory,
    color: ex.color,
    brand: ex.brand,
    features: mergeFeatures([], fromNote),
    description,
    title: itemLabel(ex.category, subCategory),
    embedding,
  };
}

/**
 * 확정할 수 있는 초안인지 AI를 부르기 전에 본다. 트랜잭션 안에서 같은 조건으로 한 번 더 확인한다.
 * 이미 확정한 물건이면 ALREADY_CONFIRMED, 없거나 토큰이 틀리거나 시간이 지났으면 NOT_FOUND.
 */
async function assertConfirmable(id: string, confirmToken: string) {
  const draft = await prisma.foundItem.count({
    where: {
      id,
      status: "ANALYZING",
      confirmTokenHash: hmac(`found-confirm:${confirmToken}`),
      expiresAt: { gt: new Date() },
      dataPurgedAt: null,
    },
  });
  if (draft > 0) return;
  const done = await prisma.foundItem.count({
    where: { id, status: { in: ["REGISTERED", "REVIEW", "REVEALED", "CLAIMED"] } },
  });
  if (done > 0) throw new AppError("ALREADY_CONFIRMED", "이미 등록을 마친 물건이에요.");
  throw new AppError("NOT_FOUND", "등록 시간이 지났거나 없는 물건이에요. 사진부터 다시 올려 주세요.");
}

/** 습득자가 고친 종류의 이름과 임베딩. 임베딩을 못 만들면 고치지 않고 확정을 막는다 */
async function correctedCategory(category: Category, sub: unknown) {
  const subCategory = subCategoryWithin(category, sub);
  const label = itemLabel(category, subCategory);
  let embedding: number[];
  try {
    embedding = await retryOnce(() => withTimeout(ai.embed(label), env.AI_TIMEOUT_MS, "임베딩"));
  } catch (err) {
    logger.warn({ err }, "습득자 종류 수정 임베딩 실패");
    throw new AppError("AI_UNAVAILABLE", "지금은 저장할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  return { category, subCategory, label, embedding };
}

/**
 * POST /found-items/:id/confirm: 두 단계 등록의 2단계. 위치·보관 방식을 받아 등록을 끝낸다.
 * 분석에 성공했으면 REGISTERED(새 후보 알림), 실패했으면 REVIEW. 습득 시각과 보관 기한은 확정한 때부터 센다.
 */
export async function confirmFoundItem(id: string, body: ConfirmFoundItemBody): Promise<RegisterFoundItemResponse> {
  // 확정 토큰부터 확인한다. 틀린 토큰으로 AI(설명 분석·임베딩)를 부르게 하지 않는다 (10/30 코드 평가)
  await assertConfirmable(id, body.confirmToken);
  const { building, place } = await resolvePlace(body);
  const corrected = body.category ? await correctedCategory(body.category, body.subCategory) : null;
  const note = scrubFinderNote(body.note);
  const notePlan = await planNote(id, note, corrected?.label ?? null);
  const foundAt = new Date();

  const item = await prisma.$transaction(async (tx) => {
    const draft = await tx.foundItem.findFirst({
      where: {
        id,
        status: "ANALYZING",
        confirmTokenHash: hmac(`found-confirm:${body.confirmToken}`),
        expiresAt: { gt: foundAt },
        dataPurgedAt: null,
      },
      select: { category: true, subCategory: true, detail: { select: { color: true, brand: true } } },
    });
    // 분석에 실패한 초안(종류 없음)은 습득자가 고쳐도 관리자 확인(REVIEW)을 거친다
    const fix = draft?.category && corrected && corrected.category !== draft.category ? corrected : null;
    if (!draft) {
      // 확정 버튼을 두 번 눌렀을 때. 확정한 물건의 id는 후보 목록에 공개되므로 알려 줘도 된다
      const done = await tx.foundItem.count({
        where: { id, status: { in: ["REGISTERED", "REVIEW", "REVEALED", "CLAIMED"] } },
      });
      if (done > 0) throw new AppError("ALREADY_CONFIRMED", "이미 등록을 마친 물건이에요.");
      throw new AppError("NOT_FOUND", "등록 시간이 지났거나 없는 물건이에요. 사진부터 다시 올려 주세요.");
    }
    // 사진 분석이 실패했어도 습득자 설명으로 종류를 알면 그 종류로 등록한다 (텍스트 분류)
    const byNote = !draft.category && notePlan?.kind === "classify" ? notePlan : null;
    const category = fix?.category ?? draft.category ?? byNote?.category ?? null;
    const subCategory = fix
      ? fix.subCategory
      : byNote
        ? byNote.subCategory
        : subCategoryWithin(draft.category, draft.subCategory);
    const status = draft.category || byNote ? ("REGISTERED" as const) : ("REVIEW" as const);
    // 같은 초안을 두 번 확정하지 않게 상태를 조건으로 바꾼다
    const changed = await tx.foundItem.updateMany({
      where: { id, status: "ANALYZING" },
      data: {
        status,
        buildingId: building?.id ?? null,
        storageType: body.storageType,
        storagePlaceId: place?.id ?? null,
        floor: body.floor ?? null,
        foundAt,
        expiresAt: new Date(foundAt.getTime() + env.FOUND_ITEM_RETENTION_DAYS * 86_400_000),
        confirmTokenHash: null,
        // 습득자가 종류를 고쳤으면 AI가 본 종류는 다른 후보(categoryAlt)로 남긴다
        ...(fix ? { category, subCategory, categoryAlt: draft.category } : {}),
        ...(byNote ? { category, subCategory } : {}),
      },
    });
    if (changed.count === 0) throw new AppError("ALREADY_CONFIRMED", "이미 등록을 마친 물건이에요.");
    await tx.foundItemDetail.update({
      where: { foundItemId: id },
      data: {
        locationDetail: body.locationDetail ?? null,
        finderNote: note,
        // AI 제목·설명은 잘못 본 물건 기준이라 고친 종류 이름으로 바꾸고, 임베딩도 그 이름으로 다시 만든다
        ...(fix ? { title: fix.label, description: fix.label } : {}),
        // 습득자 설명 특징은 비공개 특징에만 붙인다. 사진에서 못 본 색·브랜드만 채운다
        ...(notePlan?.kind === "enrich"
          ? {
              features: notePlan.features,
              ...(draft.detail?.color ? {} : notePlan.color ? { color: notePlan.color } : {}),
              ...(draft.detail?.brand ? {} : notePlan.brand ? { brand: notePlan.brand } : {}),
            }
          : {}),
        ...(byNote
          ? {
              features: byNote.features,
              color: byNote.color,
              brand: byNote.brand,
              description: byNote.description,
              title: byNote.title,
            }
          : {}),
      },
    });
    if (byNote) await setFoundItemEmbedding(id, byNote.embedding, tx);
    else if (notePlan?.kind === "enrich" && notePlan.embedding) await setFoundItemEmbedding(id, notePlan.embedding, tx);
    else if (fix) await setFoundItemEmbedding(id, fix.embedding, tx);
    return { status, category, subCategory };
  });

  if (item.status === "REGISTERED") {
    await alertNewCandidateSafely(id);
    await alertHotspotSafely(id);
  }
  await adminAlertSafely(() => alertItemIncoming(id), id, "ITEM_INCOMING");
  await adminAlertSafely(() => alertValuableInPlace(id), id, "VALUABLE_IN_PLACE");

  return {
    id,
    status: item.status,
    category: item.category,
    subCategory: item.subCategory,
    building,
    floor: body.floor ?? null,
    storageType: body.storageType,
    storagePlace: place,
    message: item.status === "REVIEW" ? REVIEW_MESSAGE : null,
    handOverAdvice: null,
  };
}
