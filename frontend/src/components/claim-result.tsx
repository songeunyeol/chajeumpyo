import { FEATURE_KEY_LABELS, type FeatureKey } from "@chajeumpyo/shared";
import { Check, IdCard, Lock, LockOpen, PackageCheck, Pencil, ShieldCheck, Store, UserCheck } from "lucide-react";
import type * as React from "react";
import { MAX_ATTEMPTS } from "@/components/candidate-card";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Alert, ResultIcon, StatusBadge, type Tone } from "@/components/ui/status";

/**
 * L-08 판정 결과. 실패·잠김·대면 확인 화면에는 맞은/틀린 항목을 절대 보여 주지 않는다(받지도 않는다).
 * 맞은 항목은 통과일 때만, 서버가 준 matchedFields만.
 */
export type ClaimView =
  | { kind: "pass"; matchedFields: string[] }
  | { kind: "question" }
  | { kind: "fail"; attemptsLeft: number }
  | { kind: "locked" }
  | { kind: "inperson" }
  | { kind: "claimed" }
  | { kind: "error"; message: string };

const FIELD_LABELS: Record<string, string> = { color: "색", brand: "브랜드", place: "장소", time: "시간" };

/** "feature:sticker" → "스티커", "color" → "색". 모르는 값은 뺀다 */
export function matchedFieldLabel(f: string): string | null {
  if (f.startsWith("feature:")) return FEATURE_KEY_LABELS[f.slice(8) as FeatureKey] ?? null;
  return FIELD_LABELS[f] ?? null;
}

export function ClaimResultScreen({
  view,
  center,
  onClose,
  onReveal,
  onQuestion,
  onEdit,
  onRetry,
}: {
  view: ClaimView;
  center: { name: string; guideText: string | null };
  onClose: () => void;
  onReveal?: () => void;
  onQuestion?: () => void;
  onEdit?: () => void;
  onRetry?: () => void;
}) {
  const back = (
    <Button variant="secondary" onClick={onClose}>
      후보 목록으로
    </Button>
  );
  let tone: Tone = "pass";
  let icon: React.ComponentProps<typeof ResultIcon>["icon"];
  let badge = "";
  let title = "";
  let body: React.ReactNode = null;
  let extra: React.ReactNode = null;
  let footer: React.ReactNode = back;

  switch (view.kind) {
    case "pass": {
      tone = "pass";
      badge = "통과";
      title = "내 물건이 맞아요";
      body = "설명한 특징이 물건과 맞았어요.";
      const labels = [...new Set(view.matchedFields.map(matchedFieldLabel).filter((x): x is string => !!x))];
      extra = labels.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0" aria-label="맞은 항목">
          {labels.map((l) => (
            <li
              key={l}
              className="inline-flex h-[26px] items-center gap-1 rounded-full bg-surface-sunken px-2.5 text-caption font-semibold text-ink-muted"
            >
              <Check className="size-3.5" aria-hidden />
              {l}
            </li>
          ))}
        </ul>
      );
      footer = (
        <Button onClick={onReveal}>
          <LockOpen aria-hidden /> 사진과 위치 보기
        </Button>
      );
      break;
    }
    case "question":
      tone = "question";
      badge = "확인 질문";
      title = "한 가지만 더 확인할게요";
      body = (
        <>
          질문 하나에 답하면 결과가 나와요.
          <br />
          답은 한 번만 보낼 수 있어요.
        </>
      );
      footer = <Button onClick={onQuestion}>질문 보기</Button>;
      break;
    case "fail":
      tone = "fail";
      badge = "일치하지 않음";
      title = "설명과 일치하지 않아요";
      body = (
        <>
          다른 사람은 모를 특징을 더 자세히
          <br />
          적어서 다시 확인해 보세요.
        </>
      );
      extra = (
        <p className="m-0 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-3 text-small text-ink-muted shadow-[0_0_0_1px_var(--border)]">
          <ShieldCheck className="size-4" aria-hidden />이 물건의 확인 기회{" "}
          <b className="text-ink">
            {MAX_ATTEMPTS}번 중 {view.attemptsLeft}번
          </b>{" "}
          남음
        </p>
      );
      footer = (
        <>
          <Button onClick={onEdit}>
            <Pencil aria-hidden /> 설명 고치기
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            후보 목록으로
          </Button>
          <p className="m-0 text-center text-caption text-ink-subtle">
            설명을 안 고치고 다시 누르면 횟수를 쓰지 않아요.
          </p>
        </>
      );
      break;
    case "locked":
      tone = "locked";
      icon = Lock;
      badge = "잠김";
      title = "확인 기회를 모두 썼어요";
      body = (
        <>
          이 물건은 앱에서 더 확인할 수 없어요.
          <br />
          학생증을 가지고 {center.name}에
          <br />
          문의해 주세요.
        </>
      );
      extra = (
        <div className="flex w-full items-center gap-3 rounded-lg bg-white px-4 py-3 text-left shadow-[0_0_0_1px_var(--border)]">
          <Store className="size-5 shrink-0" aria-hidden />
          <div className="flex flex-col">
            <b className="text-[15px]">{center.name}</b>
            {center.guideText && <span className="text-small text-ink-muted">{center.guideText}</span>}
          </div>
        </div>
      );
      footer = (
        <>
          {back}
          <p className="m-0 text-center text-caption text-ink-subtle">다른 후보는 그대로 확인할 수 있어요.</p>
        </>
      );
      break;
    case "inperson":
      tone = "inperson";
      icon = UserCheck;
      badge = "대면 확인만";
      title = "보관처에서 직접 확인해요";
      body = (
        <>
          여러 사람이 확인에 실패해서 이 물건은
          <br />앱 확인을 멈췄어요. 직원이 직접 확인한 뒤
          <br />
          돌려드려요.
        </>
      );
      extra = (
        <Alert tone="inperson" icon={IdCard} title="학생증을 가져가 주세요" className="w-full text-left">
          {center.name}
          {center.guideText ? `(${center.guideText})` : ""}에서 물건 특징을 말하면 직원이 확인해요. 신분증 번호는
          저장하지 않아요.
        </Alert>
      );
      break;
    case "claimed":
      tone = "neutral";
      icon = PackageCheck;
      badge = "수령 완료";
      title = "이미 주인이 찾아간 물건이에요";
      body = `내가 가져간 게 아니라면 ${center.name}에 문의해 주세요.`;
      break;
    case "error":
      tone = "fail";
      badge = "확인 못 함";
      title = "확인하지 못했어요";
      body = view.message;
      footer = (
        <>
          <Button onClick={onRetry}>다시 시도하기</Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            후보 목록으로
          </Button>
        </>
      );
      break;
  }

  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={{ close: onClose }} title="확인 결과" />}
      bodyClassName="items-center justify-center text-center"
      footer={footer}
    >
      <div role="status" className="flex w-full flex-col items-center gap-3" data-testid={`claim-${view.kind}`}>
        <ResultIcon tone={tone} icon={icon} />
        <StatusBadge tone={tone} icon={icon}>
          {badge}
        </StatusBadge>
        <p className="m-0 text-title font-bold">{title}</p>
        <p className="m-0 text-ink-muted">{body}</p>
        {extra}
      </div>
    </Screen>
  );
}
