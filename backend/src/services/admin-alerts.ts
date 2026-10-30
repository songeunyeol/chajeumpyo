import { floorLabel, itemLabel, subCategoryWithin, VALUABLE_CATEGORIES } from "@chajeumpyo/shared";
import { withJosa } from "../lib/josa";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { adminsInChargeOf } from "./notifications";

function isValuableCategory(category: string | null): boolean {
  return !!category && (VALUABLE_CATEGORIES as readonly string[]).includes(category);
}

/**
 * 교무처 실무용 정보 알림 (QA 10/30 3차: 관리자 알림에 등록·QR 발급이 안 뜸).
 * - 맡긴 물건 등록(ITEM_INCOMING): 습득자가 "보관처에 맡김"으로 등록하면, 실물이 오기를 기다릴 수 있게
 * - 수령 예정(PICKUP_SCHEDULED): 확인을 통과한 사람이 수령 QR을 받으면, 24시간 안에 찾으러 온다
 * - 그 자리에 둔 귀중품(VALUABLE_IN_PLACE): 귀중품도 그 자리에 둘 수 있게 바꿨으므로(10/30), 교무처가 필요하면 회수하게
 * 확인 통과 자체는 분실자 개인 활동이라 알리지 않는다(관리자가 할 일이 없고, 열람 기록은 물건 상세에 남는다).
 * 알림에는 공개 정보(종류·건물·층)만 담는다. 같은 관리자에게 같은 물건은 안 읽은 알림이 있으면 다시 만들지 않는다.
 */
type AdminAlertType = "ITEM_INCOMING" | "PICKUP_SCHEDULED" | "VALUABLE_IN_PLACE";

async function notifyAdminsOnce(type: AdminAlertType, foundItemId: string, message: string): Promise<number> {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    select: { storagePlaceId: true },
  });
  if (!item) return 0;
  const admins = await adminsInChargeOf(item.storagePlaceId);
  if (admins.length === 0) return 0;
  const already = new Set(
    (
      await prisma.notification.findMany({
        where: { type, foundItemId, userId: { in: admins }, readAt: null },
        select: { userId: true },
      })
    ).map((n) => n.userId),
  );
  const to = admins.filter((id) => !already.has(id));
  if (to.length === 0) return 0;
  await prisma.notification.createMany({ data: to.map((userId) => ({ userId, type, foundItemId, message })) });
  return to.length;
}

async function describe(foundItemId: string) {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    select: {
      category: true,
      subCategory: true,
      floor: true,
      storageType: true,
      isSeed: true,
      building: { select: { name: true } },
    },
  });
  if (!item) return null;
  const label =
    (item.category && itemLabel(item.category, subCategoryWithin(item.category, item.subCategory))) ||
    "종류 확인 전 물건";
  const place = [item.building?.name, floorLabel(item.floor)].filter(Boolean).join(" ");
  return { ...item, label, place };
}

/** "북악관 지하 1층에서 주운 무선 마우스를 맡긴다고 등록했어요. 실물이 오면 확인해 주세요." */
export async function alertItemIncoming(foundItemId: string): Promise<number> {
  const d = await describe(foundItemId);
  if (!d || d.isSeed || d.storageType !== "HANDED_OVER") return 0;
  const message = `${d.place ? `${d.place}에서 주운 ` : ""}${withJosa(d.label, "을/를")} 맡긴다고 등록했어요. 실물이 오면 확인해 주세요.`;
  return notifyAdminsOnce("ITEM_INCOMING", foundItemId, message);
}

/** "북악관 2층에 귀중품(반지갑)이 그 자리에 등록됐어요. 필요하면 교무처로 옮겨 주세요." */
export async function alertValuableInPlace(foundItemId: string): Promise<number> {
  const d = await describe(foundItemId);
  if (!d || d.isSeed || d.storageType !== "IN_PLACE" || !isValuableCategory(d.category)) return 0;
  const message = `${d.place ? `${d.place}에 ` : ""}귀중품(${d.label})이 그 자리에 등록됐어요. 필요하면 교무처로 옮겨 주세요.`;
  return notifyAdminsOnce("VALUABLE_IN_PLACE", foundItemId, message);
}

/** "무선 마우스 수령 예정: 확인을 통과한 학생이 수령 QR을 받았어요(24시간 유효)." */
export async function alertPickupScheduled(foundItemId: string, qrTtlHours: number): Promise<number> {
  const d = await describe(foundItemId);
  if (!d || d.isSeed) return 0;
  const message = `${d.label} 수령 예정: 확인을 통과한 학생이 수령 QR을 받았어요(${qrTtlHours}시간 유효).`;
  return notifyAdminsOnce("PICKUP_SCHEDULED", foundItemId, message);
}

/** 등록·QR 흐름에서 부를 때: 실패해도 throw하지 않고 로그만 남긴다 */
export function adminAlertSafely(run: () => Promise<number>, foundItemId: string, kind: AdminAlertType): Promise<void> {
  return run().then(
    (sent) => {
      if (sent > 0) logger.info({ foundItemId, sent, kind }, "관리자 알림");
    },
    (err) => logger.error({ err, foundItemId, kind }, "관리자 알림 실패"),
  );
}
