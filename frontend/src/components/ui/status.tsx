import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Database,
  Info,
  Lock,
  type LucideIcon,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** 상태 색. 항상 아이콘 + 글자와 함께 쓴다 (색만으로 구분 금지) */
export type Tone = "pass" | "question" | "fail" | "locked" | "review" | "inperson" | "seed" | "neutral" | "info";

const toneClass: Record<Tone, string> = {
  pass: "text-pass bg-pass-bg",
  question: "text-question bg-question-bg",
  fail: "text-fail bg-fail-bg",
  locked: "text-fail bg-fail-bg",
  review: "text-review bg-review-bg",
  inperson: "text-inperson bg-inperson-bg",
  seed: "text-seed bg-seed-bg",
  neutral: "text-ink-muted bg-surface-sunken",
  info: "text-brand bg-brand-soft",
};

export const toneIcon: Record<Tone, LucideIcon> = {
  pass: CircleCheck,
  question: CircleHelp,
  fail: CircleX,
  locked: Lock,
  review: Clock,
  inperson: UserCheck,
  seed: Database,
  neutral: Info,
  info: Info,
};

export function StatusBadge({
  tone,
  icon,
  children,
  className,
}: {
  tone: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = icon ?? toneIcon[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm px-2 text-caption leading-none font-bold whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      <Icon className="size-3.5 stroke-[2.4]" aria-hidden />
      {children}
    </span>
  );
}

/** 작은 글자 꼬리표 (같은 건물 등). 정보 표시용 */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm bg-brand-soft px-1.5 text-caption leading-none font-bold whitespace-nowrap text-brand",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeedBadge({ className }: { className?: string }) {
  return (
    <StatusBadge tone="seed" className={className}>
      시연용
    </StatusBadge>
  );
}

const resultClass: Record<Tone | "brand", string> = { ...toneClass, brand: "text-brand bg-brand-soft" };

/** 결과 화면의 큰 원 아이콘 */
export function ResultIcon({
  tone,
  icon,
  size = 72,
  className,
}: {
  tone: Tone | "brand";
  icon?: LucideIcon;
  size?: 64 | 72;
  className?: string;
}) {
  const Icon = icon ?? (tone === "brand" ? CircleCheck : toneIcon[tone]);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === 72 ? "size-[72px]" : "size-16",
        resultClass[tone],
        className,
      )}
      aria-hidden
    >
      <Icon className="size-9" strokeWidth={2} />
    </div>
  );
}

type AlertTone = "info" | "warn" | "fail" | "review" | "inperson" | "plain";
const alertClass: Record<AlertTone, [string, string]> = {
  info: ["bg-brand-soft", "text-brand"],
  warn: ["bg-question-bg", "text-question"],
  fail: ["bg-fail-bg", "text-fail"],
  review: ["bg-review-bg", "text-review"],
  inperson: ["bg-inperson-bg", "text-inperson"],
  plain: ["bg-surface-sunken text-ink-muted", "text-ink-muted"],
};
const alertIcon: Record<AlertTone, LucideIcon> = {
  info: Info,
  warn: TriangleAlert,
  fail: CircleX,
  review: Clock,
  inperson: UserCheck,
  plain: Info,
};

export function Alert({
  tone = "info",
  icon,
  title,
  children,
  className,
  role,
}: {
  role?: "alert" | "status";
  tone?: AlertTone;
  icon?: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = icon ?? alertIcon[tone];
  const [bg, fg] = alertClass[tone];
  return (
    <div
      role={role}
      className={cn("flex items-start gap-2.5 rounded-md px-3.5 py-3 text-[14px] leading-5", bg, className)}
    >
      <Icon className={cn("size-5 shrink-0", fg)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <b className="block font-bold">{title}</b>}
        {children}
      </div>
    </div>
  );
}
