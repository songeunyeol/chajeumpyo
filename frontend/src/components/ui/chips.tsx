import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** 칩 하나 (ToggleGroup 항목). aria-pressed로 선택 상태를 알린다 */
export function Chip({
  selected,
  icon: Icon,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { selected?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-touch items-center gap-1.5 rounded-full border border-line-strong bg-surface-card px-3.5 text-[14px] font-medium text-ink",
        selected && "border-brand bg-brand-soft font-bold text-brand",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={cn("size-[18px]", selected ? "text-brand" : "text-ink-muted")} aria-hidden />}
      {children}
    </button>
  );
}

/** 공개 근거 칩 (후보 카드). 공개 정보만 */
export function ReasonChip({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-surface-sunken px-2.5 text-caption font-semibold text-ink-muted">
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

/** 2지선다 세그먼트 (그 자리에 둠 / 보관처에 맡김). role=radiogroup */
export function Segment<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; title: string; desc?: string; icon?: LucideIcon }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          // biome-ignore lint/a11y/useSemanticElements: 카드 모양 라디오라 button+role=radio로 만든다
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-16 flex-col justify-center gap-0.5 rounded-md border border-line-strong bg-white px-3 py-2.5 text-left",
              on && "border-2 border-brand bg-brand-soft px-[11px] py-[9px]",
            )}
          >
            <b className={cn("flex items-center gap-1.5 text-[15px]", on && "text-brand")}>
              {Icon && <Icon className="size-[18px]" aria-hidden />}
              {o.title}
            </b>
            {o.desc && <small className="text-caption text-ink-muted">{o.desc}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** 라디오 목록 (건물·보관처) */
export function OptionList<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; title: React.ReactNode; desc?: React.ReactNode; badge?: React.ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-col overflow-hidden rounded-lg border border-line bg-white", className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: 줄 전체가 터치 영역인 라디오
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn("flex min-h-14 items-center gap-3 px-3.5 py-2 text-left", i > 0 && "border-t border-line")}
          >
            <span
              aria-hidden
              className={cn(
                "size-[22px] shrink-0 rounded-full border-2 border-line-strong",
                on && "border-[7px] border-brand",
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[15px] font-semibold">{o.title}</b>
              {o.desc && <small className="text-small text-ink-muted">{o.desc}</small>}
            </span>
            {o.badge}
          </button>
        );
      })}
    </div>
  );
}
