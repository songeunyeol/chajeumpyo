import { ArrowRight, Camera, FlaskConical, type LucideIcon, Search } from "lucide-react";
import type * as React from "react";
import { Link } from "react-router";
import { useFlow } from "@/components/layout/flow";
import { useSession } from "@/data";
import { cn } from "@/lib/utils";

/** C-01 첫 화면: 창구 띠 3개(습득자 초록 / 분실자 아이보리 / 체험 베이지). 띠 하나가 링크 하나 */
export function LandingPage() {
  useFlow("lost");
  const { user, isAdmin } = useSession("member");
  const lostTo = user && !isAdmin ? "/home" : "/login";

  return (
    <div className="flex min-h-dvh flex-col bg-band-demo">
      <Band
        to="/found/new"
        className="min-h-[262px] bg-band-finder text-white md:min-h-[300px]"
        inner="justify-between pt-6 pb-6"
        top={<span className="text-[13px] font-bold text-band-finder-sub">찾음표</span>}
        icon={Camera}
        iconClass="text-white"
        title="물건을 주웠어요"
        sub="가입 없이 사진만"
        subClass="text-band-finder-sub"
        arrowClass="bg-white/20 text-white"
      />
      <Band
        to={lostTo}
        className="min-h-[246px] bg-band-lost text-ink md:min-h-[260px]"
        inner="py-6"
        icon={Search}
        iconClass="text-brand"
        title="잃어버렸어요"
        sub="로그인 · 회원가입"
        subClass="text-ink-muted"
        arrowClass="bg-brand text-white"
      />
      <Band
        to="/demo"
        className="flex-1 bg-band-demo text-ink"
        inner="pt-8 pb-4"
        kicker={
          <span className="inline-flex items-center gap-1 text-[13px] font-bold text-band-demo-fg">
            <FlaskConical className="size-4" aria-hidden />
            심사위원용
          </span>
        }
        title="체험해 보기"
        sub={
          <>
            사진은 바로 올리고,
            <br className="md:hidden" /> 특징이 맞아야 위치가 열린다.
          </>
        }
        subClass="text-ink-muted"
        arrowClass="bg-[#D9CDB7] text-band-demo-fg"
      />
      <div className="mx-auto w-full max-w-app px-gutter pb-5 text-center md:max-w-[960px] md:px-12 md:text-right">
        <Link
          to="/admin/login"
          className="inline-flex min-h-touch min-w-touch items-center justify-center text-[14px] text-ink-muted underline underline-offset-4"
        >
          관리자 로그인
        </Link>
      </div>
    </div>
  );
}

function Band({
  to,
  className,
  inner,
  top,
  kicker,
  icon: Icon,
  iconClass,
  title,
  sub,
  subClass,
  arrowClass,
}: {
  to: string;
  className: string;
  inner: string;
  top?: React.ReactNode;
  /** 제목 바로 위 작은 꼬리표 */
  kicker?: React.ReactNode;
  icon?: LucideIcon;
  iconClass?: string;
  title: string;
  sub: React.ReactNode;
  subClass: string;
  arrowClass: string;
}) {
  return (
    <Link to={to} className={cn("group flex w-full focus-visible:-outline-offset-4", className)}>
      <div className={cn("mx-auto flex w-full max-w-app flex-col px-6 md:max-w-[960px] md:px-12", inner)}>
        {top}
        <div className={cn("flex items-end gap-3 md:items-center", top ? "mt-auto" : "my-auto")}>
          <div className="flex min-w-0 flex-1 flex-col">
            {Icon && <Icon className={cn("mb-4 size-8", iconClass)} strokeWidth={2} aria-hidden />}
            {kicker && <span className="mb-2">{kicker}</span>}
            <span className="text-display font-bold tracking-tight-ko md:text-[40px] md:leading-[50px]">{title}</span>
            <span className={cn("mt-1 text-[14px] leading-5 md:mt-2 md:text-[17px] md:leading-6", subClass)}>
              {sub}
            </span>
          </div>
          <span
            aria-hidden
            className={cn(
              "mb-1 flex size-11 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5 md:mb-0 md:size-14",
              arrowClass,
            )}
          >
            <ArrowRight className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
