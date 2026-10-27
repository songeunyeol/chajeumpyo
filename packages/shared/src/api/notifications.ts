import { z } from "zod";
import { NotificationType } from "../enums";

/** 한 번에 내려주는 최대 개수 */
export const NOTIFICATION_PAGE_SIZE = 50;

export const NotificationItem = z.object({
  id: z.string(),
  type: NotificationType,
  /** 공개 정보만 담은 문구 */
  message: z.string(),
  foundItemId: z.string().nullable(),
  lostReportId: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationItem = z.infer<typeof NotificationItem>;

/** GET /notifications */
export const NotificationListResponse = z.object({
  notifications: z.array(NotificationItem),
  unreadCount: z.number().int(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponse>;

export const NotificationIdParams = z.object({ id: z.uuid() });
