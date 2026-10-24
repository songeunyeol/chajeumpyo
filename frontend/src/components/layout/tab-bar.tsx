import { Bell, House, UserRound } from "lucide-react";
import { NavLink } from "react-router";
import { useNotifications } from "@/data";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/home", label: "홈", icon: House },
  { to: "/notifications", label: "알림", icon: Bell },
  { to: "/me", label: "내 정보", icon: UserRound },
] as const;

/** 분실자 하단 탭: 홈·알림·내 정보 */
export function TabBar() {
  const { data } = useNotifications();
  const unread = data?.unreadCount ?? 0;
  return (
    <nav
      aria-label="주요 메뉴"
      className="safe-bottom sticky bottom-0 z-20 grid h-tabbar shrink-0 grid-cols-3 border-t border-line bg-surface-card"
    >
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "relative flex flex-col items-center justify-center gap-0.5 text-caption text-ink-subtle",
              isActive && "font-bold text-brand",
            )
          }
        >
          <Icon className="size-6" aria-hidden />
          {label}
          {to === "/notifications" && unread > 0 && (
            <>
              <span aria-hidden className="absolute top-2.5 left-[calc(50%+8px)] size-2 rounded-full bg-fail" />
              <span className="sr-only">안 읽은 알림 {unread}개</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
