import { ChevronLeft, FlaskConical, X } from "lucide-react";
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
        <div
          className={cn(
            "sticky z-10 flex flex-col gap-2 bg-inherit px-gutter pt-3",
            tabs ? "bottom-tabbar pb-5" : "bottom-0 pb-[calc(20px+env(safe-area-inset-bottom))]",
          )}
        >
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
      체험 모드 <span className="font-normal">· 시연용 데이터로 움직여요</span>
    </div>
  );
}

/** 왼쪽 버튼: 뒤로(true 또는 경로 또는 { back: 함수 }) / 닫기({ close: 경로 }) / 없음 */
export type Leading = boolean | string | { close: string | (() => void) } | { back: () => void };

function LeadingButton({ leading }: { leading?: Leading }) {
  const navigate = useNavigate();
  if (!leading) return <span className="w-3" />;
  const isClose = typeof leading === "object" && "close" in leading;
  return (
    <button
      type="button"
      aria-label={isClose ? "닫기" : "뒤로 가기"}
      className="inline-flex size-touch shrink-0 items-center justify-center rounded-md"
      onClick={() => {
        if (typeof leading === "object" && "back" in leading) leading.back();
        else if (typeof leading === "object") {
          if (typeof leading.close === "function") leading.close();
          else navigate(leading.close);
        } else if (typeof leading === "string") navigate(leading);
        else navigate(-1);
      }}
    >
      {isClose ? <X className="size-6" aria-hidden /> : <ChevronLeft className="size-6" aria-hidden />}
    </button>
  );
}

const bandClass: Record<Flow, string> = {
  finder: "bg-band-finder text-band-finder-fg",
  lost: "border-b border-line bg-band-lost text-ink",
  demo: "bg-band-demo text-ink",
  admin: "bg-band-admin text-white",
};

/** 머리 띠 (흐름 색, 56px) */
export function BandHeader({
  variant,
  title,
  back,
  right,
}: {
  variant: Flow;
  title?: React.ReactNode;
  back?: Leading;
  right?: React.ReactNode;
}) {
  return (
    <header className={cn("sticky top-0 z-20 flex min-h-header shrink-0 items-center gap-1 px-2", bandClass[variant])}>
      <LeadingButton leading={back} />
      <h1 className="m-0 flex-1 truncate text-body-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
}

/** 띠 오른쪽 단계 글자 (1 / 2) */
export function StepCount({ current, total }: { current: number; total: number }) {
  return (
    <span className="px-3 text-[13px] font-semibold" role="img" aria-label={`${total}단계 중 ${current}단계`}>
      {current} / {total}
    </span>
  );
}

/** 큰 띠 머리 (흐름 첫 화면): 뒤로 + 제목 24 + 한 줄 설명 + (단계 막대) */
export function BandHero({
  variant,
  title,
  back,
  right,
  eyebrow,
  children,
  stepper,
}: {
  variant: "finder" | "lost" | "demo" | "admin";
  title: React.ReactNode;
  back?: Leading;
  right?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  stepper?: React.ReactNode;
}) {
  return (
    <header className={cn("shrink-0 px-2 pt-2 pb-6", bandClass[variant], "border-b-0")}>
      {(back || right) && (
        <div className="flex min-h-touch items-center justify-between">
          <LeadingButton leading={back} />
          {right}
        </div>
      )}
      {eyebrow && <div className="px-3 text-[13px] font-bold">{eyebrow}</div>}
      <h1 className="mx-3 mt-2 mb-1 text-headline font-bold tracking-tight-ko">{title}</h1>
      {children && (
        <div
          className={cn(
            "mx-3 text-[14px] leading-5",
            variant === "finder" ? "text-band-finder-sub" : variant === "admin" ? "text-white/75" : "text-ink-muted",
          )}
        >
          {children}
        </div>
      )}
      {stepper && <div className="mx-3 mt-4">{stepper}</div>}
    </header>
  );
}
