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
          // 열 때 첫 입력에 포커스를 주지 않는다(휴대폰 키보드가 바로 올라오지 않게). 포커스는 시트 안에 갇힌다
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          tabIndex={-1}
          {...(description ? {} : { "aria-describedby": undefined })}
          onPointerDownOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-app flex-col gap-3.5 overflow-y-auto rounded-t-xl bg-surface-card px-gutter pt-2 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-sheet outline-none",
            className,
          )}
        >
          <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-[2px] bg-line-strong" />
          <DialogPrimitive.Title className="m-0 text-title font-bold tracking-tight-ko">{title}</DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="m-0 text-ink-muted">{description}</DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
