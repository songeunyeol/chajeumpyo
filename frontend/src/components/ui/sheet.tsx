import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** 바텀시트 (radix Dialog). 포커스 가둠·Esc 닫기 포함 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className={cn(
            "safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-app flex-col gap-3.5 overflow-y-auto rounded-t-xl bg-surface-card px-gutter pt-2 pb-5 shadow-sheet outline-none",
            className,
          )}
        >
          <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-[2px] bg-line-strong" />
          <DialogPrimitive.Title className="m-0 text-title font-bold tracking-tight-ko">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="m-0 text-ink-muted">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
