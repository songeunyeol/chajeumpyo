import { type NotificationListResponse, NotificationListResponse as NotificationListSchema } from "@chajeumpyo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type SessionScope, useSessionValue } from "@/lib/auth";
import { request } from "@/lib/http";
import { currentScope } from "./auth";
import { qk } from "./keys";

// C-04 알림함. 회원·관리자 모두 쓰므로 scope로 어느 세션인지 고른다

/** 알림함 + 하단 탭 점(unreadCount). 1분마다 새로 받는다 */
export function useNotifications(scope: SessionScope = currentScope()) {
  const session = useSessionValue(scope);
  return useQuery({
    queryKey: qk.notifications(scope),
    queryFn: ({ signal }) => request("/notifications", { auth: scope, schema: NotificationListSchema, signal }),
    enabled: !!session,
    refetchInterval: 60_000,
  });
}

/** 하나 읽음. 바로 점을 없애고(낙관적 갱신) 실패하면 되돌린다 */
export function useMarkNotificationRead(scope: SessionScope = currentScope()) {
  const qc = useQueryClient();
  const key = qk.notifications(scope);
  return useMutation({
    mutationFn: (id: string) => request(`/notifications/${id}/read`, { method: "PATCH", auth: scope }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationListResponse>(key);
      if (prev) {
        const now = new Date().toISOString();
        const wasUnread = prev.notifications.some((n) => n.id === id && !n.readAt);
        qc.setQueryData<NotificationListResponse>(key, {
          notifications: prev.notifications.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)),
          unreadCount: Math.max(0, prev.unreadCount - (wasUnread ? 1 : 0)),
        });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** 모두 읽음 */
export function useMarkAllNotificationsRead(scope: SessionScope = currentScope()) {
  const qc = useQueryClient();
  const key = qk.notifications(scope);
  return useMutation({
    mutationFn: () => request("/notifications/read-all", { method: "PATCH", auth: scope }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
