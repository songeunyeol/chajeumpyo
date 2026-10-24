import { CircleCheck, CircleDot, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useFinderFlow } from "./flow-context";

const STEPS = ["사진 올리기", "AI가 종류·특징 알아보기", "등록 마무리"];

/** 시간 기반 진행률: 10초에 90%까지, 끝나면 100% */
export function progressAt(ms: number): number {
  return Math.min(90, (ms / 10_000) * 90);
}

/** F-03 등록 중: 요청이 끝나면 F-04로. 뒤로 가기 버튼 없음 */
export function FinderUploadingPage() {
  const navigate = useNavigate();
  const { register, submitted } = useFinderFlow();
  const [elapsed, setElapsed] = useState(0);
  const done = register.isSuccess || register.isError;

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => navigate("/found/new/result", { replace: true }), 300);
    return () => clearTimeout(id);
  }, [done, navigate]);

  if (!submitted) return <Navigate to="/found/new" replace />;

  const step = done ? 3 : elapsed < 1200 ? 0 : elapsed < 8000 ? 1 : 2;
  const value = done ? 100 : progressAt(elapsed);

  return (
    <Screen
      flow="finder"
      header={<BandHeader variant="finder" title="등록하는 중" />}
      bodyClassName="justify-center items-center text-center gap-5"
    >
      <div className="flex size-[72px] items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
        <LoaderCircle className="size-9 animate-spin motion-reduce:animate-none" />
      </div>
      <div className="flex flex-col gap-1" role="status" aria-live="polite">
        <p className="m-0 text-title font-bold">물건을 알아보고 있어요</p>
        <p className="m-0 text-ink-muted">10초 안에 끝나요. 화면을 닫지 마세요.</p>
      </div>
      <Progress value={value} label="등록 진행" />
      <ol className="m-0 flex w-full list-none flex-col gap-3 p-0 text-left">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "now" : "todo";
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
                  "size-5",
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
    </Screen>
  );
}
