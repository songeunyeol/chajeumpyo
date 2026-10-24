import { CircleCheck, CircleDot, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** 화면을 연 뒤 지난 시간(ms) */
export function useElapsed(tickMs = 200): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return elapsed;
}

/**
 * 시간 기반 단계 목록. 결과를 암시하지 않고 시간에 따라 넘어간다.
 * at[i]: i번째 단계가 "진행 중"이 되는 시각(ms). 마지막 단계는 done이 될 때까지 진행 중으로 남는다.
 */
export function TimedSteps({
  steps,
  at,
  elapsed,
  done,
}: {
  steps: string[];
  at: number[];
  elapsed: number;
  done?: boolean;
}) {
  let current = 0;
  at.forEach((t, i) => {
    if (elapsed >= t) current = i;
  });
  if (done) current = steps.length;
  return (
    <ol className="m-0 flex w-full list-none flex-col gap-3 p-0 text-left">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        const Icon = state === "done" ? CircleCheck : state === "now" ? LoaderCircle : CircleDot;
        return (
          <li
            key={s}
            className={cn(
              "flex min-h-6 items-center gap-2.5 text-[15px]",
              state === "now" && "font-semibold",
              state === "todo" && "text-ink-subtle",
            )}
          >
            <Icon
              className={cn(
                "size-5 shrink-0",
                state === "done" && "text-pass",
                state === "now" && "animate-spin text-brand motion-reduce:animate-none",
              )}
              aria-hidden
            />
            {s}
            <span className="sr-only">{state === "done" ? " 끝남" : state === "now" ? " 진행 중" : " 대기"}</span>
          </li>
        );
      })}
    </ol>
  );
}
