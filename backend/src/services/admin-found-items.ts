import {
  ADMIN_PAGE_SIZE,
  type AdminCloseFoundItemRequest,
  type AdminFoundItemDetailResponse,
  type AdminFoundItemListQuery,
  type AdminFoundItemListResponse,
  type AdminUpdateFoundItemRequest,
  AiFeature,
  type FoundStatus,
  subCategoryWithin,
} from "@chajeumpyo/shared";
import { z } from "zod";
import { ai } from "../ai";
import { demoEnabled, env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { setFoundItemEmbedding } from "../repositories/embedding";
import { storage } from "../storage";
import { alertNewCandidateSafely } from "./candidate-alerts";
import { purgeFoundItemData } from "./data-purge";
import { maskEmail } from "./pickups";

const ADMIN_IMAGE_TTL_SECONDS = 10 * 60;

type Admin = { userId: string; storagePlaceId: number | null };

/**
 * 관리자가 볼 수 있는 습득물 범위 (open-issues #18 추천안)
 * - 경비실(GUARD) 관리자: 자기 보관처 물건만
 * - 종합서비스센터(CENTER) 관리자, 보관처가 없는 관리자: 전체 (보관처 없는 물건·검토 대기 포함)
 */
export async function adminScope(admin: Admin): Promise<Prisma.FoundItemWhereInput> {
  // 체험·시연이 꺼져 있으면 체험용 시드 물건은 관리자 목록에도 보이지 않는다
  const seed: Prisma.FoundItemWhereInput = demoEnabled ? {} : { isSeed: false };
  if (admin.storagePlaceId === null) return seed;
  const place = await prisma.storagePlace.findUnique({ where: { id: admin.storagePlaceId }, select: { org: true } });
  if (place?.org === "CENTER") return seed;
  return { ...seed, storagePlaceId: admin.storagePlaceId };
}

const summarySelect = {
  id: true,
  status: true,
  category: true,
  subCategory: true,
  storageType: true,
  foundAt: true,
  isSeed: true,
  floor: true,
  claimLockedAt: true,
  closedAt: true,
  closedReason: true,
  building: { select: { id: true, name: true } },
  storagePlace: { select: { id: true, name: true, guideText: true } },
  detail: { select: { title: true } },
} satisfies Prisma.FoundItemSelect;

type Summary = Prisma.FoundItemGetPayload<{ select: typeof summarySelect }>;
const toSummary = ({ detail, ...i }: Summary) => ({
  ...i,
  subCategory: subCategoryWithin(i.category, i.subCategory),
  title: detail?.title ?? null,
  foundAt: i.foundAt.toISOString(),
  claimLockedAt: i.claimLockedAt?.toISOString() ?? null,
  closedAt: i.closedAt?.toISOString() ?? null,
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
  return { items: items.map(toSummary), page: query.page, pageSize: ADMIN_PAGE_SIZE, total, counts };
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
      closedBy: { select: { email: true } },
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
    locationDetail: d.locationDetail,
    finderNote: d.finderNote,
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
    closedByEmailMasked: item.closedBy ? maskEmail(item.closedBy.email) : null,
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
  // 세부 종류: 직접 주면 그 종류에 속해야 한다. 생략하면 지금 값을 두되, 종류가 바뀌어 속하지 않으면 지운다
  let subCategory = subCategoryWithin(category, item.subCategory);
  if (input.subCategory !== undefined) {
    subCategory = input.subCategory === null ? null : subCategoryWithin(category, input.subCategory);
    if (input.subCategory !== null && !subCategory) {
      throw new AppError("VALIDATION_ERROR", "이 종류에 없는 세부 종류예요.", [
        { path: "subCategory", message: "종류에 속하지 않음" },
      ]);
    }
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

  // 관리자가 종류를 바꾸고 2순위를 따로 주지 않으면 AI가 본 2순위는 버린다 (습득자가 고칠 때와 같은 규칙)
  const categoryChanged = input.category !== undefined && input.category !== item.category;
  const categoryAlt = input.categoryAlt !== undefined ? input.categoryAlt : categoryChanged ? null : item.categoryAlt;
  await prisma.$transaction(async (tx) => {
    await tx.foundItem.update({
      where: { id },
      data: {
        category,
        subCategory,
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

/** 보관을 끝낼 수 있는 상태: 등록됨·열람됨·검토 대기. 확정 전 초안은 정기 작업이 지우고, 수령·만료는 이미 끝났다 */
const CLOSABLE = ["REGISTERED", "REVEALED", "REVIEW"] as const;

/**
 * POST /admin/found-items/:id/close (QA 10/30 3차: 관리자 화면에 지우는 기능이 없음)
 * 행을 지우지 않고 기한 만료(EXPIRED)로 바꿔 후보·공개 목록에서 뺀다. 이유·처리 관리자·시각을 남긴다.
 * - 잘못 등록: 사진과 비공개 정보를 바로 지운다
 * - 폐기·이관: 기한 만료 물건과 같은 정기 작업이 지운다
 * 기록(시도·열람·수령)은 기한 만료 물건처럼 30일 뒤 지운다. 받아 간 수령 QR은 만료시킨다.
 */
export async function closeFoundItem(
  admin: Admin,
  id: string,
  input: AdminCloseFoundItemRequest,
): Promise<AdminFoundItemDetailResponse> {
  await getScopedItem(admin, id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const item = await tx.foundItem.findUniqueOrThrow({ where: { id }, select: { status: true, isSeed: true } });
    if (item.status === "CLAIMED") throw new AppError("ALREADY_CLAIMED", "이미 수령된 물건이에요.");
    if (item.isSeed) throw new AppError("NOT_CLOSABLE", "체험용 물건은 보관을 끝낼 수 없어요.");
    // 같은 순간 수령 처리와 겹치지 않게 상태를 조건으로 바꾼다
    const changed = await tx.foundItem.updateMany({
      where: { id, status: { in: [...CLOSABLE] } },
      data: {
        status: "EXPIRED",
        expiresAt: now,
        closedAt: now,
        closedReason: input.reason,
        closedById: admin.userId,
      },
    });
    if (changed.count === 0) throw new AppError("NOT_CLOSABLE", "보관 중인 물건만 끝낼 수 있어요.");
    await tx.pickup.updateMany({ where: { foundItemId: id, status: "ISSUED" }, data: { status: "EXPIRED" } });
  });
  logger.info({ foundItemId: id, reason: input.reason }, "관리자 보관 종료");
  if (input.reason === "MISREGISTERED") {
    try {
      await purgeFoundItemData(id, now);
    } catch (err) {
      logger.error({ err, foundItemId: id }, "잘못 등록 물건 정리 실패 → 정기 작업이 다시 시도");
    }
  }
  return getFoundItem(admin, id);
}
