import { ChevronLeft, FlaskConical } from "lucide-react";
import type * as React from "react";
import { useNavigate } from "react-router";
import { useSession } from "@/data";
import { cn } from "@/lib/utils";
import { type Flow, useFlow } from "./flow";
import { TabBar } from "./tab-bar";

/**
 * 화면 한 장. 360px 기준, PC에서는 가운데 최대 폭(분실자·습득자 480px, 관리자 1200px).
 * 구조: [체험 모드 띠] [머리 띠] [본문(스크롤)] [하단 버튼] [하단 탭]
 */
export function Screen({
  flow,
  header,
  footer,
  tabs,
  wide,
  className,
  bodyClassName,
  children,
}: {
  flow: Flow;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  tabs?: boolean;
  wide?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  useFlow(flow);
  const { isDemo } = useSession();
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-col bg-surface",
        wide ? "max-w-admin" : "max-w-app md:shadow-[0_0_0_1px_var(--border)]",
        flow === "lost" && "bg-band-lost",
        className,
      )}
    >
      {isDemo && flow !== "admin" && <DemoStrip />}
      {header}
      <main id="main" className={cn("flex flex-1 flex-col gap-4 px-gutter py-5", footer && "pb-2", bodyClassName)}>
        {children}
      </main>
      {footer && (
        <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-inherit px-gutter pt-3 pb-5 safe-bottom">
          {footer}
        </div>
      )}
      {tabs && <TabBar />}
    </div>
  );
}

/** 체험 모드 띠 (모든 체험 화면 맨 위) */
export function DemoStrip() {
  return (
    <div
      role="status"
      className="flex h-8 shrink-0 items-center gap-1.5 border-b border-[#D9CDB7] bg-band-demo px-4 text-[13px] font-semibold text-band-demo-fg"
    >
      <FlaskConical className="size-4" aria-hidden />
      체험 모드 <span className="font-normal">· 시연용 데이터예요</span>
    </div>
  );
}

/** 머리 띠 (흐름 색) */
export function BandHeader({
  variant,
  title,
  back,
  right,
}: {
  variant: Flow;
  title?: React.ReactNode;
  /** true면 뒤로 가기, 문자열이면 그 경로로 */
  back?: boolean | string;
  right?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-header shrink-0 items-center gap-1 px-2",
        variant === "finder" && "bg-band-finder text-band-finder-fg",
        variant === "lost" && "border-b border-line bg-band-lost text-ink",
        variant === "demo" && "bg-band-demo text-ink",
        variant === "admin" && "bg-band-admin text-white",
      )}
    >
      {back ? (
        <button
          type="button"
          aria-label="뒤로 가기"
          className="inline-flex size-touch items-center justify-center rounded-md"
          onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      ) : (
        <span className="w-3" />
      )}
      <h1 className="m-0 flex-1 truncate text-body-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
}

/** 큰 띠 머리 (흐름 첫 화면) */
export function BandHero({
  variant,
  eyebrow = "찾음표",
  title,
  children,
}: {
  variant: "finder" | "lost" | "demo";
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "shrink-0 px-2 pt-2 pb-6",
        variant === "finder" && "bg-band-finder text-white",
        variant === "lost" && "bg-band-lost",
        variant === "demo" && "bg-band-demo",
      )}
    >
      <div className={cn("px-3 text-[13px] font-bold", variant === "finder" && "text-band-finder-sub")}>{eyebrow}</div>
      <h2 className="mx-3 mt-2 mb-1 text-headline font-bold tracking-tight-ko">{title}</h2>
      {children && (
        <div
          className={cn("mx-3 text-[14px] leading-5", variant === "finder" ? "text-band-finder-sub" : "text-ink-muted")}
        >
          {children}
        </div>
      )}
    </div>
  );
}
