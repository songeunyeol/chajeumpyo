import { Lock } from "lucide-react";
import { BandHeader, Screen } from "@/components/layout/screen";
import { TimedSteps, useElapsed } from "@/components/progress-steps";
import { Progress } from "@/components/ui/misc";

/** L-07 판정 중: 결과를 암시하지 않는 시간 기반 연출 */
export function JudgingScreen() {
  const elapsed = useElapsed();
  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" title="확인하는 중" />}
      bodyClassName="items-center justify-center text-center gap-5"
    >
      <div
        className="animate-breathe flex size-[88px] items-center justify-center rounded-full bg-brand-soft text-brand"
        aria-hidden
      >
        <Lock className="size-9" />
      </div>
      <div role="status" className="flex flex-col gap-1">
        <p className="m-0 text-title font-bold">설명과 물건을 비교하고 있어요</p>
        <p className="m-0 text-ink-muted">몇 초면 끝나요. 잠시만 기다려 주세요.</p>
      </div>
      <div className="w-full max-w-[240px]">
        <Progress value={Math.min(90, (elapsed / 8000) * 90)} label="확인 진행" />
      </div>
      <div className="w-fit">
        <TimedSteps steps={["설명 읽기", "특징 하나씩 비교하기", "결과 정리"]} at={[0, 1000, 5000]} elapsed={elapsed} />
      </div>
    </Screen>
  );
}
