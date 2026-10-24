import type * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-sm bg-surface-sunken motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

/** 진행 막대. value가 없으면 흐르는 막대 */
export function Progress({ value, label }: { value?: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-[3px] bg-surface-sunken"
    >
      {value === undefined ? (
        <i className="animate-progress block h-full w-2/5 rounded-[3px] bg-brand" />
      ) : (
        <i
          className="block h-full rounded-[3px] bg-brand transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
    </div>
  );
}

/** 단계 표시 (회원가입 3단계 등) */
export function Stepper({ total, current, onBand }: { total: number; current: number; onBand?: boolean }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`${total}단계 중 ${current}단계`}>
      {Array.from({ length: total }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: 고정 길이 단계 막대
          key={i}
          className={cn(
            "block h-1 flex-1 rounded-[2px]",
            onBand ? (i < current ? "bg-white" : "bg-white/25") : i < current ? "bg-brand" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      {icon}
      <p className="m-0 text-body-lg font-bold">{title}</p>
      {children && <div className="m-0 text-ink-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("m-0 h-px border-0 bg-line", className)} />;
}
