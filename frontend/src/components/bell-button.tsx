import { Bell } from "lucide-react";
import { Link } from "react-router";
import { useNotifications } from "@/data";

/** 머리 띠 알림 종 + 안 읽음 점 */
export function BellButton() {
  const { data } = useNotifications();
  const unread = data?.unreadCount ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `알림, 안 읽은 알림 ${unread}개` : "알림"}
      className="relative inline-flex size-touch items-center justify-center rounded-md"
    >
      <Bell className="size-6" aria-hidden />
      {unread > 0 && <span aria-hidden className="absolute top-2.5 right-2.5 size-2 rounded-full bg-fail" />}
    </Link>
  );
}
