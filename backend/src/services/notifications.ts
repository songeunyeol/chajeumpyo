import { type Category, itemLabel, subCategoryWithin } from "@chajeumpyo/shared";
import type { Prisma } from "../generated/prisma/client";
import { withJosa } from "../lib/josa";
import { prisma } from "../lib/prisma";

type Db = Pick<Prisma.TransactionClient, "user" | "notification">;

/**
 * 습득물을 맡은 관리자들.
 * 보관처가 있으면 그 보관처 관리자, 없거나 관리자가 없으면 종합서비스센터(CENTER) 관리자 (open-issues #18 추천안)
 */
export async function adminsInChargeOf(storagePlaceId: number | null, db: Db = prisma): Promise<string[]> {
  if (storagePlaceId !== null) {
    const own = await db.user.findMany({ where: { role: "ADMIN", storagePlaceId }, select: { id: true } });
    if (own.length > 0) return own.map((u) => u.id);
  }
  const center = await db.user.findMany({
    where: { role: "ADMIN", storagePlace: { org: "CENTER" } },
    select: { id: true },
  });
  return center.map((u) => u.id);
}

/** 알림은 공개 정보만 담는다 (F-13) */
export async function notifyUsers(
  userIds: string[],
  data: {
    type: "NEW_CANDIDATE" | "MULTI_REVEAL" | "CLAIM_LOCKED" | "SYSTEM";
    message: string;
    foundItemId?: string;
    lostReportId?: string;
  },
  db: Db = prisma,
) {
  if (userIds.length === 0) return;
  await db.notification.createMany({ data: userIds.map((userId) => ({ userId, ...data })) });
}

/**
 * 알림에 쓰는 물건 이름. 세부 종류가 있으면 그 이름("화장품", "인형 키링"), 없으면 큰 종류 이름.
 * 큰 종류만 쓰면 화장품이 "기타가 새로 등록됐어요"처럼 보였다 (검증 10/31). 세부 종류는 공개 정보다
 */
export function notificationItemLabel(item: { category: Category; subCategory?: string | null }): string {
  return itemLabel(item.category, subCategoryWithin(item.category, item.subCategory ?? null));
}

/** 새 후보 알림 문구: "혜인관에서 무선 이어폰이 새로 등록됐어요." */
export function newCandidateMessage(buildingName: string | null, categoryLabel: string): string {
  return `${buildingName ? `${buildingName}에서 ` : ""}${withJosa(categoryLabel, "이/가")} 새로 등록됐어요.`;
}
