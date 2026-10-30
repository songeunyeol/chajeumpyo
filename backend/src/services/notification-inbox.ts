import { NOTIFICATION_PAGE_SIZE, type NotificationListResponse } from "@chajeumpyo/shared";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

type Row = { id: string; type: string; foundItemId: string | null; readAt: Date | null };

/**
 * 같은 물건의 새 후보 알림이 여러 개면 가장 최근 것 하나만 남긴다.
 * 예전에는 신고마다 알림을 만들어서, 신고를 여러 개 연 사람에게 같은 알림이 여러 번 보였다(QA 10/30).
 * 지금은 사람마다 한 번만 만들지만, 이미 쌓인 알림은 지우지 않고 보여 줄 때 묶는다.
 * rows는 최신순이어야 한다.
 */
/** 물건 하나에 하나만 보이면 되는 알림. 관리자 정보 알림(맡긴 물건, 수령 예정)도 같은 물건이면 묶는다 */
const PER_ITEM = new Set(["NEW_CANDIDATE", "ITEM_INCOMING", "PICKUP_SCHEDULED", "VALUABLE_IN_PLACE"]);

function dedupe<T extends Row>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((n) => {
    if (!PER_ITEM.has(n.type) || !n.foundItemId) return true;
    const key = `${n.type}:${n.foundItemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** GET /notifications: 내 알림 최신순 (F-13). 관리자도 자기 알림을 본다 (open-issues #13). */
export async function listNotifications(userId: string): Promise<NotificationListResponse> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      // 묶여서 줄어드는 만큼 넉넉히 읽는다
      take: NOTIFICATION_PAGE_SIZE * 3,
    }),
    prisma.notification.findMany({
      where: { userId, readAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true, type: true, foundItemId: true, readAt: true },
    }),
  ]);
  return {
    notifications: dedupe(rows)
      .slice(0, NOTIFICATION_PAGE_SIZE)
      .map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        foundItemId: n.foundItemId,
        lostReportId: n.lostReportId,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    unreadCount: dedupe(unread).length,
  };
}

/** PATCH /notifications/:id/read. 이미 읽었으면 그대로 둔다. 묶여 보이는 같은 물건 알림도 함께 읽음으로. */
export async function markRead(userId: string, id: string): Promise<void> {
  const n = await prisma.notification.findFirst({
    where: { id, userId },
    select: { readAt: true, type: true, foundItemId: true },
  });
  if (!n) throw new AppError("NOT_FOUND", "알림을 찾을 수 없어요.");
  const sameItem = PER_ITEM.has(n.type) && n.foundItemId ? { type: n.type, foundItemId: n.foundItemId } : { id };
  await prisma.notification.updateMany({ where: { userId, readAt: null, ...sameItem }, data: { readAt: new Date() } });
}

/** PATCH /notifications/read-all */
export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
