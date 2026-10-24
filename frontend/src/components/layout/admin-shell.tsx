import { ChartColumn, House, ListFilter, LogOut, ScanLine } from "lucide-react";
import type * as React from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useAdminFoundItems, useLogout, useSession } from "@/data";
import { cn } from "@/lib/utils";
import { useFlow } from "./flow";
import { BandHeader, type Leading } from "./screen";

const NAV = [
  { to: "/admin", label: "홈", icon: House, end: true },
  { to: "/admin/items", label: "습득물", icon: ListFilter, end: false },
  { to: "/admin/scan", label: "QR 스캔", icon: ScanLine, end: false },
  { to: "/admin/hotspots", label: "다발 카드", long: "분실 다발 카드", icon: ChartColumn, end: false },
] as const;

/** 관리자 화면 틀: PC(≥1024px)는 왼쪽 먹색 내비 232px + 본문, 모바일은 화면마다 머리 띠 + 하단 탭 4개 */
export function AdminShell() {
  useFlow("admin");
  const navigate = useNavigate();
  const logout = useLogout();
  const { storagePlace } = useSession();
  const counts = useAdminFoundItems({ page: 1 }).data?.counts;
  const review = counts?.REVIEW ?? 0;
  return (
    <div className="min-h-dvh bg-surface lg:flex">
      <aside
        aria-label="관리자 메뉴"
        className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col bg-band-admin px-3 py-6 text-white lg:flex"
      >
        <p className="m-0 mb-6 flex items-baseline gap-2 px-3">
          <b className="text-[16px]">찾음표 관리자</b>
          {storagePlace && <span className="truncate text-[12px] text-white/70">{storagePlace.name}</span>}
        </p>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-touch items-center gap-3 rounded-md px-3 text-[15px] text-white/85 hover:bg-white/10",
                  isActive && "bg-white/12 font-bold text-white",
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              <span className="flex-1">{"long" in rest ? rest.long : label}</span>
              {to === "/admin/items" && review > 0 && (
                <span className="rounded-sm bg-review-bg px-1.5 py-0.5 text-[12px] font-bold text-review">
                  검토 {review}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            logout("admin");
            navigate("/admin/login", { replace: true });
          }}
          className="mt-auto flex min-h-touch items-center gap-3 rounded-md px-3 text-[15px] text-white/85 hover:bg-white/10"
        >
          <LogOut className="size-5" aria-hidden />
          로그아웃
        </button>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}

/** 관리자 모바일 하단 탭: 홈·습득물·QR 스캔·다발 카드 (PC에서는 숨김) */
export function AdminTabBar() {
  return (
    <nav
      aria-label="관리자 메뉴"
      className="safe-bottom sticky bottom-0 z-20 grid h-tabbar shrink-0 grid-cols-4 border-t border-line bg-surface-card lg:hidden"
    >
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-0.5 text-caption text-ink-subtle",
              isActive && "font-bold text-brand",
            )
          }
        >
          <Icon className="size-6" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * 관리자 화면 한 장. 모바일: 먹색 머리 띠 + 본문 + 하단 버튼 + (탭). PC: 띠 대신 본문 위 큰 제목 줄.
 */
export function AdminPage({
  title,
  pcTitle,
  back,
  right,
  pcRight,
  tabs,
  footer,
  narrow,
  dark,
  bodyClassName,
  children,
}: {
  title: React.ReactNode;
  pcTitle?: React.ReactNode;
  back?: Leading;
  right?: React.ReactNode;
  pcRight?: React.ReactNode;
  tabs?: boolean;
  footer?: React.ReactNode;
  /** PC에서도 480px 가운데 (확인·결과 화면) */
  narrow?: boolean;
  /** 카메라 화면처럼 어두운 바탕 */
  dark?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-dvh flex-1 flex-col", dark && "bg-[#141A17]")}>
      <div className="lg:hidden">
        <BandHeader variant="admin" title={title} back={back} right={right} />
      </div>
      <div
        className={cn("mx-auto flex w-full flex-1 flex-col", narrow ? "max-w-app" : "max-w-app lg:max-w-admin lg:px-8")}
      >
        <div className="hidden min-h-[72px] items-center gap-3 px-gutter pt-6 lg:flex">
          <h1 className="m-0 flex-1 text-[22px] font-bold tracking-tight-ko">{pcTitle ?? title}</h1>
          {pcRight}
        </div>
        <main id="main" className={cn("flex flex-1 flex-col gap-4 px-gutter py-5", bodyClassName)}>
          {children}
        </main>
        {footer && (
          <div
            className={cn(
              "sticky z-10 flex flex-col gap-2 px-gutter pt-3",
              dark ? "bg-[#141A17]" : "bg-surface",
              tabs ? "bottom-tabbar pb-5 lg:bottom-0" : "bottom-0 pb-[calc(20px+env(safe-area-inset-bottom))]",
            )}
          >
            {footer}
          </div>
        )}
      </div>
      {tabs && <AdminTabBar />}
    </div>
  );
}
