import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** 체크 줄 (동의 항목). 줄 전체가 44px 이상 터치 영역 */
export function CheckRow({
  checked,
  onCheckedChange,
  id,
  children,
  description,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id: string;
  children: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={cn("flex min-h-touch cursor-pointer items-start gap-3 py-2", className)}>
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 border-line-strong bg-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
          checked && "border-brand bg-brand text-white",
        )}
      >
        {checked && <Check className="size-4 stroke-[3]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{children}</span>
        {description && <span className="text-small text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}
