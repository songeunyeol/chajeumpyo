import type * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-input w-full rounded-md border border-line-strong bg-surface-card px-3.5 text-[16px] text-ink placeholder:text-ink-subtle outline-none transition-shadow focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgba(30,91,61,0.16)] focus-visible:outline-none aria-invalid:border-fail read-only:bg-surface-sunken read-only:text-ink-muted disabled:bg-surface-sunken disabled:text-ink-subtle";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClass, "h-auto min-h-[120px] resize-none py-3 leading-6", className)}
      {...props}
    />
  );
}
