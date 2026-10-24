import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md border border-transparent px-4 font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:border-transparent disabled:bg-surface-sunken disabled:text-ink-subtle [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-pressed",
        secondary: "border-line-strong bg-surface-card text-brand hover:bg-brand-soft",
        danger: "bg-fail text-white hover:opacity-90",
        "danger-outline": "border-[#E7B7B2] bg-surface-card text-fail hover:bg-fail-bg",
        ghost: "bg-transparent text-brand hover:bg-brand-soft",
        onband: "bg-white text-band-finder hover:bg-brand-soft",
      },
      size: {
        lg: "h-btn w-full text-[16px]",
        md: "h-touch text-[15px]",
        icon: "size-touch p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <LoaderCircle className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
