import { randomBytes } from "node:crypto";
import type {
  PickupCompleteResponse,
  PickupQrResponse,
  PickupScanResponse,
  Role,
  SelfPickupResponse,
} from "@chajeumpyo/shared";
import type { Prisma } from "../generated/prisma/client";
import { AppError } from "../lib/errors";
import { hmac } from "../lib/hash";
import { prisma } from "../lib/prisma";
import { storage } from "../storage";
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

    // 체험 계정: 관리자 스캔 없이 바로 완료, 시드 상태는 그대로 (F-05)
    if (viewer.role === "DEMO") {
      const now = new Date();
      const p = await tx.pickup.create({
        data: {
          foundItemId,
          userId: viewer.userId,
          method: "DEMO",
          status: "COMPLETED",
          completedAt: now,
          purgeAfter: purgeAfter(now),
        },
      });
      return { method: "DEMO", pickupId: p.id, status: "COMPLETED", completedAt: now.toISOString() };
    }

    if (item.status === "CLAIMED") throw claimedError();
    // 같은 사람이 다시 받으면 이전 QR은 만료
    await tx.pickup.updateMany({
      where: { foundItemId, userId: viewer.userId, status: "ISSUED" },
      data: { status: "EXPIRED" },
    });
    const qrToken = `pk_${randomBytes(24).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + QR_TTL_HOURS * 3600_000);
    const p = await tx.pickup.create({
      data: {
        foundItemId,
        userId: viewer.userId,
        method: "CENTER_QR",
        status: "ISSUED",
        qrTokenHash: hmac(qrToken),
        qrExpiresAt: expiresAt,
      },
    });
    return { method: "CENTER_QR", pickupId: p.id, qrToken, status: "ISSUED", expiresAt: expiresAt.toISOString() };
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
    if (!isDemo) await markClaimed(tx, foundItemId, attempt.lostReportId, p.id);
    return { pickupId: p.id, method: p.method, status: p.status, completedAt: now.toISOString() };
  });
  // 수령이 끝났으니 사진과 비공개 정보를 지운다 (#33). 체험 수령은 시드를 지우지 않는다.
  if (result.method !== "DEMO") await purgeAfterClaimSafely(foundItemId);
  return result;
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
    include: {
      user: { select: { email: true } },
      foundItem: { include: { building: { select: { name: true } }, detail: { select: { imageOriginalKey: true } } } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND", "수령 QR을 찾을 수 없어요.");
  if (p.foundItem.storagePlaceId === null || p.foundItem.storagePlaceId !== admin.storagePlaceId) {
    throw new AppError("FORBIDDEN", "우리 보관처에 맡겨진 물건이 아니에요.");
  }
  if (p.status === "COMPLETED" || p.foundItem.status === "CLAIMED") throw claimedError();
  if (p.status === "EXPIRED" || !p.qrExpiresAt || p.qrExpiresAt < new Date()) {
    throw new AppError("QR_EXPIRED", "만료된 수령 QR이에요. 새 QR을 받아 달라고 안내해 주세요.");
  }
  return p;
}

/** POST /admin/pickups/scan (F-11, F-14) */
export async function scanPickup(admin: Admin, qrToken: string): Promise<PickupScanResponse> {
  const p = await usablePickup(prisma, admin, { qrTokenHash: hmac(qrToken) });
  const item = p.foundItem;
  if (!item.category || !item.detail) throw new AppError("NOT_FOUND", "물건 정보가 없어요.");
  return {
    pickupId: p.id,
    foundItem: {
      id: item.id,
      category: item.category,
      building: item.building.name,
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
    const attempt = await passedAttempt(tx, p.userId, p.foundItemId);

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
