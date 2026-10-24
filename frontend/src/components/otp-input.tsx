import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 6자리 코드 입력. 진짜 입력은 하나(붙여넣기·자동 채우기 `one-time-code`)이고, 그 위에 칸 6개를 그린다.
 */
export function OtpInput({
  value,
  onChange,
  invalid,
  disabled,
  id,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative w-fit">
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const cur = focused && i === Math.min(value.length, 5);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 고정 6칸
              key={i}
              className={cn(
                "flex h-[52px] w-11 items-center justify-center rounded-md border border-line-strong bg-white text-[22px] font-bold",
                cur && "border-brand shadow-[0_0_0_3px_rgba(30,91,61,0.16)]",
                invalid && "border-fail",
                disabled && "bg-surface-sunken text-ink-subtle",
              )}
            >
              {value[i] ?? ""}
            </div>
          );
        })}
      </div>
      <input
        id={id}
        aria-label="인증 코드 6자리"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  );
}
