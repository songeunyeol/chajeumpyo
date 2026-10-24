import { CircleAlert } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** 라벨 + 입력 + 도움말/오류. 오류는 아이콘과 글자로 함께 보인다 */
export function Field({
  label,
  htmlFor,
  optional,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[14px] leading-5 font-semibold">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-subtle">(선택)</span>}
      </label>
      {children}
      {error ? (
        <ErrorText id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</ErrorText>
      ) : hint ? (
        <Hint>{hint}</Hint>
      ) : null}
    </div>
  );
}

export function Hint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("m-0 text-small text-ink-muted", className)} {...props} />;
}

export function ErrorText({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p role="alert" className={cn("m-0 flex items-start gap-1 text-small font-medium text-fail", className)} {...props}>
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function SectionLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("m-0 text-[13px] leading-[18px] font-bold text-ink-muted", className)} {...props} />;
}
