import { Eye, EyeOff } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 비밀번호 입력 + 보기 토글(44px) */
export function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        aria-label={show ? "비밀번호 가리기" : "비밀번호 보기"}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
        className="absolute top-1/2 right-1 inline-flex size-touch -translate-y-1/2 items-center justify-center rounded-md text-ink"
      >
        {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
