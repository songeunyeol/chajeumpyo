import {
  ADMIN_PAGE_SIZE,
  type AdminFoundItemDetailResponse,
  type AdminFoundItemListQuery,
  type AdminFoundItemListResponse,
  type AdminUpdateFoundItemRequest,
  AiFeature,
  type FoundStatus,
} from "@chajeumpyo/shared";
import { z } from "zod";
import { ai } from "../ai";
import { env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { setFoundItemEmbedding } from "../repositories/embedding";
import { storage } from "../storage";
import { alertNewCandidateSafely } from "./candidate-alerts";
import { maskEmail } from "./pickups";

const ADMIN_IMAGE_TTL_SECONDS = 10 * 60;

type Admin = { userId: string; storagePlaceId: number | null };

/**
 * 관리자가 볼 수 있는 습득물 범위 (open-issues #18 추천안)
 * - 경비실(GUARD) 관리자: 자기 보관처 물건만
 * - 종합서비스센터(CENTER) 관리자, 보관처가 없는 관리자: 전체 (보관처 없는 물건·검토 대기 포함)
 */
export async function adminScope(admin: Admin): Promise<Prisma.FoundItemWhereInput> {
  if (admin.storagePlaceId === null) return {};
  const place = await prisma.storagePlace.findUnique({ where: { id: admin.storagePlaceId }, select: { org: true } });
  if (place?.org === "CENTER") return {};
  return { storagePlaceId: admin.storagePlaceId };
}

const summarySelect = {
  id: true,
  status: true,
  category: true,
  storageType: true,
  foundAt: true,
  isSeed: true,
  floor: true,
  claimLockedAt: true,
  building: { select: { id: true, name: true } },
  storagePlace: { select: { id: true, name: true, guideText: true } },
  detail: { select: { title: true, imagePublicKey: true } },
} satisfies Prisma.FoundItemSelect;

type Summary = Prisma.FoundItemGetPayload<{ select: typeof summarySelect }>;
const toSummary = ({ detail, ...i }: Summary) => ({
  ...i,
  title: detail?.title ?? null,
  foundAt: i.foundAt.toISOString(),
  claimLockedAt: i.claimLockedAt?.toISOString() ?? null,
});

/** 목록 행: 공개본(민감하면 흐린 사진) 썸네일만. 원본 키는 고르지도 않는다 */
const toListItem = async (s: Summary) => ({
  ...toSummary(s),
  thumbnailUrl: s.detail?.imagePublicKey
    ? await storage.signedUrl(s.detail.imagePublicKey, ADMIN_IMAGE_TTL_SECONDS)
    : null,
});

/** GET /admin/found-items (F-14) */
export async function listFoundItems(
  admin: Admin,
  query: AdminFoundItemListQuery,
): Promise<AdminFoundItemListResponse> {
  const scope = await adminScope(admin);
  const where = { ...scope, ...(query.status ? { status: query.status } : {}) };
  const [items, total, grouped] = await Promise.all([
    prisma.foundItem.findMany({
      where,
      select: summarySelect,
      orderBy: [{ foundAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
    }),
    prisma.foundItem.count({ where }),
    prisma.foundItem.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const counts: Partial<Record<FoundStatus, number>> = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  return {
    items: await Promise.all(items.map(toListItem)),
    page: query.page,
    pageSize: ADMIN_PAGE_SIZE,
    total,
    counts,
  };
}

/** 범위 안의 물건만. 범위 밖이면 403, 없으면 404 */
async function getScopedItem(admin: Admin, id: string) {
  const item = await prisma.foundItem.findUnique({ where: { id }, select: { id: true } });
  if (!item) throw new AppError("NOT_FOUND", "물건을 찾을 수 없어요.");
  const scoped = await prisma.foundItem.findFirst({
    where: { id, ...(await adminScope(admin)) },
    select: { id: true },
  });
  if (!scoped) throw new AppError("FORBIDDEN", "관리 범위 밖의 물건이에요.");
}

const Features = z.array(AiFeature).catch([]);

/** GET /admin/found-items/:id (F-14) */
export async function getFoundItem(admin: Admin, id: string): Promise<AdminFoundItemDetailResponse> {
  await getScopedItem(admin, id);
  const item = await prisma.foundItem.findUniqueOrThrow({
    where: { id },
    select: {
      ...summarySelect,
      categoryAlt: true,
      expiresAt: true,
      detail: true,
      attempts: { orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } },
      reveals: { orderBy: { revealedAt: "desc" }, include: { user: { select: { email: true } } } },
      pickups: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } }, processedBy: { select: { email: true } } },
      },
    },
  });
  const d = item.detail;
  if (!d) throw new AppError("NOT_FOUND", "물건 정보가 없어요.");
  return {
    ...toSummary(item),
    categoryAlt: item.categoryAlt,
    color: d.color,
    brand: d.brand,
    features: Features.parse(d.features),
    description: d.description,
    isSensitive: d.isSensitive,
    originalImageUrl: d.imageOriginalKey ? await storage.signedUrl(d.imageOriginalKey, ADMIN_IMAGE_TTL_SECONDS) : null,
    publicImageUrl: d.imagePublicKey ? await storage.signedUrl(d.imagePublicKey, ADMIN_IMAGE_TTL_SECONDS) : null,
    thumbnailUrl: d.imageThumbKey ? await storage.signedUrl(d.imageThumbKey, ADMIN_IMAGE_TTL_SECONDS) : null,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    attempts: item.attempts.map((a) => ({
      emailMasked: maskEmail(a.user.email),
      result: a.result,
      answerCorrect: a.answerCorrect,
      createdAt: a.createdAt.toISOString(),
    })),
    reveals: item.reveals.map((r) => ({
      emailMasked: maskEmail(r.user.email),
      revealedAt: r.revealedAt.toISOString(),
    })),
    pickups: item.pickups.map((p) => ({
      id: p.id,
      emailMasked: p.user ? maskEmail(p.user.email) : null,
      method: p.method,
      status: p.status,
      completedAt: p.completedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      processedByEmailMasked: p.processedBy ? maskEmail(p.processedBy.email) : null,
      verificationNote: p.verificationNote,
    })),
  };
}

/**
 * PATCH /admin/found-items/:id (F-14, F-02 검토 대기 처리)
 * - 속성을 고친다. 설명이 바뀌면 임베딩을 다시 만든다.
 * - status=REGISTERED는 검토 대기 물건에만. 종류가 있어야 하고, 임베딩을 만든 뒤 새 후보 알림을 보낸다.
 */
export async function updateFoundItem(
  admin: Admin,
  id: string,
  input: AdminUpdateFoundItemRequest,
): Promise<AdminFoundItemDetailResponse> {
  await getScopedItem(admin, id);
  const item = await prisma.foundItem.findUniqueOrThrow({ where: { id }, include: { detail: true } });
  const registering = input.status === "REGISTERED";
  if (registering && item.status !== "REVIEW") {
    throw new AppError("VALIDATION_ERROR", "검토 대기 물건만 등록 처리할 수 있어요.");
  }
  const category = input.category ?? item.category;
  if (registering && !category) {
    throw new AppError("VALIDATION_ERROR", "종류를 정해야 등록할 수 있어요.", [{ path: "category", message: "필수" }]);
  }
  const description = input.description ?? item.detail?.description ?? null;
  if (registering && !description) {
    throw new AppError("VALIDATION_ERROR", "설명을 적어야 등록할 수 있어요.", [
      { path: "description", message: "필수" },
    ]);
  }

  // 등록하거나 설명이 바뀌면 임베딩을 새로 만든다. 실패하면 아무것도 바꾸지 않는다.
  const needsEmbedding = description !== null && (registering || input.description !== undefined);
  let embedding: number[] | null = null;
  if (needsEmbedding) {
    try {
      embedding = await retryOnce(() => withTimeout(ai.embed(description), env.AI_TIMEOUT_MS, "임베딩"));
    } catch (err) {
      logger.warn({ err }, "관리자 수정 임베딩 실패");
      throw new AppError("AI_UNAVAILABLE", "지금은 저장할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  const categoryAlt = input.categoryAlt === undefined ? item.categoryAlt : input.categoryAlt;
  await prisma.$transaction(async (tx) => {
    await tx.foundItem.update({
      where: { id },
      data: {
        category,
        categoryAlt: categoryAlt && categoryAlt !== category ? categoryAlt : null,
        ...(registering ? { status: "REGISTERED" as const } : {}),
        detail: {
          update: {
            ...(input.color !== undefined ? { color: input.color } : {}),
            ...(input.brand !== undefined ? { brand: input.brand } : {}),
            ...(input.features !== undefined ? { features: input.features } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
          },
        },
      },
    });
    if (embedding) await setFoundItemEmbedding(id, embedding, tx);
  });

  if (registering) await alertNewCandidateSafely(id);
  return getFoundItem(admin, id);
}
