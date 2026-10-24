import type * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "flat" | "soft" }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-surface-card p-4",
        variant === "default" && "shadow-card",
        variant === "flat" && "shadow-[0_0_0_1px_var(--border)]",
        variant === "soft" && "bg-brand-soft",
        className,
      )}
      {...props}
    />
  );
}

/** 이름-값 표 (dl) */
export function KeyValue({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("m-0 grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-[14px] leading-5", className)}>
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="m-0 font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
