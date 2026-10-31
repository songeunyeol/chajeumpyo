import { randomBytes } from "node:crypto";
import {
  type InPersonPickupResponse,
  type PickupCompleteResponse,
  type PickupQrResponse,
  type PickupScanResponse,
  type Role,
  type SelfPickupResponse,
  subCategoryWithin,
} from "@chajeumpyo/shared";
import type { Prisma } from "../generated/prisma/client";
import { AppError } from "../lib/errors";
import { hmac } from "../lib/hash";
import { prisma } from "../lib/prisma";
import { formatShortCode, newShortCode, normalizeShortCode } from "../lib/short-code";
import { storage } from "../storage";
import { adminScope } from "./admin-found-items";
import { purgeAfterClaimSafely } from "./data-purge";

/** 수령 QR 유효 시간 (초안) */
export const QR_TTL_HOURS = 24;
/** 수령 완료 후 기록 보관 기간 (초안, F-12) */
export const RECORD_RETENTION_DAYS = 30;
/** 관리자 스캔 화면의 원본 사진 링크 유효 시간 */
const ADMIN_IMAGE_TTL_SECONDS = 10 * 60;

type Viewer = { userId: string; role: Role };
type Admin = { userId: string; storagePlaceId: number | null };
type Tx = Prisma.TransactionClient;

const claimedError = () => new AppError("ALREADY_CLAIMED", "이미 수령된 물건이에요.");

/** 같은 물건의 수령 처리는 하나씩 */
async function lockItem(tx: Tx, foundItemId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pickup:${foundItemId}`}, 0))`;
}

/** 이 계정이 통과한 시도 (수령 자격). 없으면 403 */
async function passedAttempt(db: Tx, userId: string, foundItemId: string) {
  const attempt = await db.matchAttempt.findFirst({
    where: { userId, foundItemId, OR: [{ result: "PASS" }, { answerCorrect: true }] },
    orderBy: { createdAt: "asc" },
  });
  if (!attempt) throw new AppError("FORBIDDEN", "내 물건인지 확인을 통과해야 수령할 수 있어요.");
  return attempt;
}

async function loadItem(db: Tx, foundItemId: string) {
  const item = await db.foundItem.findUnique({ where: { id: foundItemId } });
  if (!item) throw new AppError("NOT_FOUND", "물건을 찾을 수 없어요.");
  return item;
}

/** 일반 수령 완료 처리: 물건 CLAIMED, 신고 RESOLVED, 다른 사람의 발급된 QR 만료 */
async function markClaimed(tx: Tx, foundItemId: string, lostReportId: string, exceptPickupId: string) {
  await tx.foundItem.update({ where: { id: foundItemId }, data: { status: "CLAIMED" } });
  await tx.lostReport.updateMany({ where: { id: lostReportId, status: "OPEN" }, data: { status: "RESOLVED" } });
  await tx.pickup.updateMany({
    where: { foundItemId, status: "ISSUED", id: { not: exceptPickupId } },
    data: { status: "EXPIRED" },
  });
}

/** 8자리 수령 코드의 저장값. QR 토큰과 섞이지 않게 접두어를 붙여 HMAC한다 */
const shortCodeHash = (code: string) => hmac(`pickup-code:${code}`);

/** 발급 중인 수령 건과 겹치지 않는 8자리 코드. 겹칠 확률은 거의 없지만 몇 번 다시 뽑는다 */
async function uniqueShortCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newShortCode();
    const taken = await tx.pickup.findFirst({
      where: { shortCodeHash: shortCodeHash(code), status: "ISSUED" },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new AppError("INTERNAL_ERROR", "수령 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

/** 같은 사람이 다시 받으면 이전 QR(과 8자리 코드)은 만료하고 새로 만든다 */
async function issueToken(tx: Tx, userId: string, foundItemId: string, method: "CENTER_QR" | "DEMO") {
  await tx.pickup.updateMany({
    where: { foundItemId, userId, method, status: "ISSUED" },
    data: { status: "EXPIRED" },
  });
  return {
    qrToken: `pk_${randomBytes(24).toString("base64url")}`,
    shortCode: await uniqueShortCode(tx),
    expiresAt: new Date(Date.now() + QR_TTL_HOURS * 3600_000),
  };
}

/** 체험 수령이 끝나면 체험 계정의 신고만 끝낸다. 시드 물건은 다른 체험 계정이 다시 쓰므로 그대로 둔다 */
async function resolveDemoReport(tx: Tx, userId: string, lostReportId: string) {
  await tx.lostReport.updateMany({ where: { id: lostReportId, userId, status: "OPEN" }, data: { status: "RESOLVED" } });
}

const purgeAfter = (from: Date) => new Date(from.getTime() + RECORD_RETENTION_DAYS * 86_400_000);

/** POST /found-items/:id/pickup-qr (F-11) */
export async function issuePickupQr(viewer: Viewer, foundItemId: string): Promise<PickupQrResponse> {
  return prisma.$transaction(async (tx) => {
    await lockItem(tx, foundItemId);
    const item = await loadItem(tx, foundItemId);
    await passedAttempt(tx, viewer.userId, foundItemId);
    if (item.storageType !== "HANDED_OVER") {
      throw new AppError(
        "INVALID_STORAGE_TYPE",
        "그 자리에 둔 물건이라 수령 QR이 필요 없어요. '찾았어요'를 눌러 주세요.",
      );
    }

    // 체험 계정: 실제와 같은 QR을 준다. 관리자 스캔(CENTER_QR만 찾음)에는 안 쓰이고, 시드 상태는 그대로 (F-05)
    if (viewer.role === "DEMO") {
      const { qrToken, shortCode, expiresAt } = await issueToken(tx, viewer.userId, foundItemId, "DEMO");
      const p = await tx.pickup.create({
        data: {
          foundItemId,
          userId: viewer.userId,
          method: "DEMO",
          status: "ISSUED",
          qrTokenHash: hmac(qrToken),
          shortCodeHash: shortCodeHash(shortCode),
          qrExpiresAt: expiresAt,
        },
      });
      return {
        method: "DEMO",
        pickupId: p.id,
        qrToken,
        shortCode: formatShortCode(shortCode),
        status: "ISSUED",
        expiresAt: expiresAt.toISOString(),
      };
    }

    if (item.status === "CLAIMED") throw claimedError();
    const { qrToken, shortCode, expiresAt } = await issueToken(tx, viewer.userId, foundItemId, "CENTER_QR");
    const p = await tx.pickup.create({
      data: {
        foundItemId,
        userId: viewer.userId,
        method: "CENTER_QR",
        status: "ISSUED",
        qrTokenHash: hmac(qrToken),
        shortCodeHash: shortCodeHash(shortCode),
        qrExpiresAt: expiresAt,
      },
    });
    return {
      method: "CENTER_QR",
      pickupId: p.id,
      qrToken,
      shortCode: formatShortCode(shortCode),
      status: "ISSUED",
      expiresAt: expiresAt.toISOString(),
    };
  });
}

/** POST /found-items/:id/self-pickup: 그 자리에 둔 물건을 본인이 찾았다고 알림 (F-11) */
export async function selfPickup(viewer: Viewer, foundItemId: string): Promise<SelfPickupResponse> {
  const result = await prisma.$transaction(async (tx) => {
    await lockItem(tx, foundItemId);
    const item = await loadItem(tx, foundItemId);
    const attempt = await passedAttempt(tx, viewer.userId, foundItemId);
    if (item.storageType !== "IN_PLACE") {
      throw new AppError("INVALID_STORAGE_TYPE", "보관처에 맡긴 물건이에요. 수령 QR을 받아 보관처에서 찾아 주세요.");
    }
    const now = new Date();
    const isDemo = viewer.role === "DEMO";
    if (!isDemo && item.status === "CLAIMED") throw claimedError();

    const p = await tx.pickup.create({
      data: {
        foundItemId,
        userId: viewer.userId,
        method: isDemo ? "DEMO" : "SELF_REPORT",
        status: "COMPLETED",
        completedAt: now,
        purgeAfter: purgeAfter(now),
      },
    });
    if (isDemo) await resolveDemoReport(tx, viewer.userId, attempt.lostReportId);
    else await markClaimed(tx, foundItemId, attempt.lostReportId, p.id);
    return { pickupId: p.id, method: p.method, status: p.status, completedAt: now.toISOString() };
  });
  // 수령이 끝났으니 사진과 비공개 정보를 지운다 (#33). 체험 수령은 시드를 지우지 않는다.
  if (result.method !== "DEMO") await purgeAfterClaimSafely(foundItemId);
  return result;
}

/**
 * POST /found-items/:id/demo-pickup: 체험 계정의 "교무처 스캔 대신하기".
 * 받아 둔 체험 QR을 완료하고 신고를 끝낸다. 실제 수령처럼 물건을 CLAIMED로 바꾸거나 사진을 지우지 않는다(시드).
 */
export async function completeDemoPickup(viewer: Viewer, foundItemId: string): Promise<PickupCompleteResponse> {
  if (viewer.role !== "DEMO")
    throw new AppError("FORBIDDEN", "체험 계정에서만 쓸 수 있어요. 교무처에서 QR을 보여 주세요.");
  return prisma.$transaction(async (tx) => {
    await lockItem(tx, foundItemId);
    const attempt = await passedAttempt(tx, viewer.userId, foundItemId);
    const p = await tx.pickup.findFirst({
      where: { foundItemId, userId: viewer.userId, method: "DEMO", status: "ISSUED", qrExpiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!p) throw new AppError("NOT_FOUND", "먼저 수령 QR을 받아 주세요.");
    const now = new Date();
    await tx.pickup.update({
      where: { id: p.id },
      data: { status: "COMPLETED", completedAt: now, purgeAfter: purgeAfter(now) },
    });
    await resolveDemoReport(tx, viewer.userId, attempt.lostReportId);
    return { pickupId: p.id, status: "COMPLETED" as const, completedAt: now.toISOString() };
  });
}

/** 이메일 가리기: st****@skuniv.ac.kr */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(4, local.length - 2))}@${domain}`;
}

/** QR로 찾은 수령 건이 지금 처리 가능한지 확인한다 */
async function usablePickup(db: Tx, admin: Admin, where: Prisma.PickupWhereInput) {
  const p = await db.pickup.findFirst({
    where: { ...where, method: "CENTER_QR" },
    // 8자리 코드는 지난 수령 건과 겹칠 수 있어 가장 최근 건을 본다
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, email: true } },
      foundItem: { include: { building: { select: { name: true } }, detail: { select: { imageOriginalKey: true } } } },
    },
  });
  if (!p?.user) throw new AppError("NOT_FOUND", "수령 QR을 찾을 수 없어요.");
  if (p.foundItem.storagePlaceId === null || p.foundItem.storagePlaceId !== admin.storagePlaceId) {
    throw new AppError("FORBIDDEN", "우리 보관처에 맡겨진 물건이 아니에요.");
  }
  if (p.status === "COMPLETED" || p.foundItem.status === "CLAIMED") throw claimedError();
  if (p.status === "EXPIRED" || !p.qrExpiresAt || p.qrExpiresAt < new Date()) {
    throw new AppError("QR_EXPIRED", "만료된 수령 QR이에요. 새 QR을 받아 달라고 안내해 주세요.");
  }
  return { ...p, user: p.user };
}

/** 8자리 코드를 틀린 횟수 (관리자별). 코드를 하나씩 대 보는 것을 막는다 */
export const SHORT_CODE_FAIL_LIMIT = { count: 20, windowMinutes: 10 } as const;
const shortCodeFails = new Map<string, number[]>();

function checkShortCodeLimit(adminId: string, now = Date.now()) {
  const since = now - SHORT_CODE_FAIL_LIMIT.windowMinutes * 60_000;
  const recent = (shortCodeFails.get(adminId) ?? []).filter((t) => t > since);
  shortCodeFails.set(adminId, recent);
  if (recent.length >= SHORT_CODE_FAIL_LIMIT.count) {
    throw new AppError("RATE_LIMITED", "수령 코드를 너무 많이 틀렸어요. 10분 뒤에 다시 넣어 주세요.");
  }
}

/** 테스트용: 틀린 횟수 기록을 비운다 */
export function resetShortCodeFails() {
  shortCodeFails.clear();
}

/**
 * POST /admin/pickups/scan (F-11, F-14).
 * QR 안의 긴 토큰(pk_…)이나 학생 화면의 8자리 코드를 받는다. 8자리 코드는 틀리면 관리자별로 센다.
 */
export async function scanPickup(admin: Admin, input: string): Promise<PickupScanResponse> {
  const raw = input.trim();
  const code = raw.startsWith("pk_") ? null : normalizeShortCode(raw);
  let p: Awaited<ReturnType<typeof usablePickup>>;
  if (code) {
    checkShortCodeLimit(admin.userId);
    try {
      p = await usablePickup(prisma, admin, { shortCodeHash: shortCodeHash(code) });
    } catch (err) {
      if (err instanceof AppError && err.code === "NOT_FOUND") {
        shortCodeFails.set(admin.userId, [...(shortCodeFails.get(admin.userId) ?? []), Date.now()]);
      }
      throw err;
    }
  } else {
    p = await usablePickup(prisma, admin, { qrTokenHash: hmac(raw) });
  }
  const item = p.foundItem;
  if (!item.category || !item.detail) throw new AppError("NOT_FOUND", "물건 정보가 없어요.");
  return {
    pickupId: p.id,
    foundItem: {
      id: item.id,
      category: item.category,
      subCategory: subCategoryWithin(item.category, item.subCategory),
      building: item.building?.name ?? null,
      imageUrl: item.detail.imageOriginalKey
        ? await storage.signedUrl(item.detail.imageOriginalKey, ADMIN_IMAGE_TTL_SECONDS)
        : null,
    },
    claimant: { emailMasked: maskEmail(p.user.email) },
    expiresAt: (p.qrExpiresAt as Date).toISOString(),
  };
}

/** POST /admin/pickups/:id/complete (F-11, F-14). 먼저 완료된 쪽만 인정한다. */
export async function completePickup(admin: Admin, pickupId: string): Promise<PickupCompleteResponse> {
  let foundItemId = "";
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.pickup.findUnique({ where: { id: pickupId }, select: { foundItemId: true } });
    if (!found) throw new AppError("NOT_FOUND", "수령 건을 찾을 수 없어요.");
    await lockItem(tx, found.foundItemId);
    const p = await usablePickup(tx, admin, { id: pickupId });
    const attempt = await passedAttempt(tx, p.user.id, p.foundItemId);

    const now = new Date();
    await tx.pickup.update({
      where: { id: p.id },
      data: { status: "COMPLETED", completedAt: now, processedByAdminId: admin.userId, purgeAfter: purgeAfter(now) },
    });
    await markClaimed(tx, p.foundItemId, attempt.lostReportId, p.id);
    foundItemId = p.foundItemId;
    return { pickupId: p.id, status: "COMPLETED" as const, completedAt: now.toISOString() };
  });
  await purgeAfterClaimSafely(foundItemId);
  return result;
}

/**
 * POST /admin/found-items/:id/in-person-pickup (#29 후속, #8 리뷰)
 * 모든 계정의 확인 실패가 한도에 닿아 온라인 확인이 막힌 물건을, 관리자가 신분을 직접 확인하고 내준다.
 * - 관리 범위 안의 물건만(경비실은 자기 보관처, 종합서비스센터는 전체). 막히지 않은 물건은 QR 수령으로.
 * - 처리 관리자와 신분 확인 메모를 남긴다. 메모는 수령 기록과 함께 30일 뒤 지운다 (F-12).
 * - 찾으러 온 사람의 계정은 모를 수 있어 신고는 그대로 둔다. 다른 사람이 받아 둔 QR은 만료한다.
 */
export async function completeInPersonPickup(
  admin: Admin,
  foundItemId: string,
  verificationNote: string,
): Promise<InPersonPickupResponse> {
  const result = await prisma.$transaction(async (tx) => {
    await lockItem(tx, foundItemId);
    const item = await loadItem(tx, foundItemId);
    const scoped = await tx.foundItem.count({ where: { id: foundItemId, ...(await adminScope(admin)) } });
    if (!scoped) throw new AppError("FORBIDDEN", "관리 범위 밖의 물건이에요.");
    if (item.status === "CLAIMED") throw claimedError();
    if (!item.claimLockedAt || !(item.status === "REGISTERED" || item.status === "REVEALED")) {
      throw new AppError(
        "NOT_IN_PERSON_ITEM",
        "대면 확인으로 넘어간 보관 중인 물건만 여기서 처리해요. 확인을 통과한 분은 수령 QR로 처리해 주세요.",
      );
    }

    const now = new Date();
    const p = await tx.pickup.create({
      data: {
        foundItemId,
        method: "IN_PERSON",
        status: "COMPLETED",
        processedByAdminId: admin.userId,
        verificationNote,
        completedAt: now,
        purgeAfter: purgeAfter(now),
      },
    });
    await tx.foundItem.update({ where: { id: foundItemId }, data: { status: "CLAIMED" } });
    await tx.pickup.updateMany({ where: { foundItemId, status: "ISSUED" }, data: { status: "EXPIRED" } });
    return {
      pickupId: p.id,
      method: "IN_PERSON" as const,
      status: "COMPLETED" as const,
      completedAt: now.toISOString(),
    };
  });
  await purgeAfterClaimSafely(foundItemId);
  return result;
}
