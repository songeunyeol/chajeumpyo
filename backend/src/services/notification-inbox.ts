import { NOTIFICATION_PAGE_SIZE, type NotificationListResponse } from "@chajeumpyo/shared";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

/** GET /notifications: 내 알림 최신순 (F-13). 관리자도 자기 알림을 본다 (open-issues #13). */
export async function listNotifications(userId: string): Promise<NotificationListResponse> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: NOTIFICATION_PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      foundItemId: n.foundItemId,
      lostReportId: n.lostReportId,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

/** PATCH /notifications/:id/read. 이미 읽었으면 그대로 둔다. */
export async function markRead(userId: string, id: string): Promise<void> {
  const n = await prisma.notification.findFirst({ where: { id, userId }, select: { readAt: true } });
  if (!n) throw new AppError("NOT_FOUND", "알림을 찾을 수 없어요.");
  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

/** PATCH /notifications/read-all */
export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
