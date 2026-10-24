import { CONSENT_TEXTS, CONSENT_VERSION } from "@chajeumpyo/shared";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckRow } from "@/components/ui/checkbox";
import { Divider } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { type ConsentFlow, type ConsentRecord, saveConsent } from "@/lib/consent-store";
import { cn } from "@/lib/utils";

type Item = "email" | "externalAi" | "location";

const ITEMS: Record<Item, { title: string; required: boolean; text: string }> = {
  email: { title: "학교 이메일 수집", required: true, text: CONSENT_TEXTS.email },
  externalAi: { title: "사진·설명 외부 AI 처리", required: true, text: CONSENT_TEXTS.externalAi },
  location: { title: "위치 사용", required: false, text: CONSENT_TEXTS.location },
};

/** 흐름별 항목: 습득자·체험은 이메일을 모으지 않는다 */
export const consentItems = (flow: ConsentFlow): Item[] =>
  flow === "member" ? ["email", "externalAi", "location"] : ["externalAi", "location"];

/**
 * C-02 동의 바텀시트. 필수 항목을 모두 체크해야 [동의하고 계속하기]가 켜진다.
 * 동의하면 기기에 기록(consent-store)하고 onAgree로 넘긴다. 실제 동의는 각 요청 본문에 담는다.
 */
export function ConsentSheet({
  flow,
  open,
  onOpenChange,
  onAgree,
  initial,
}: {
  flow: ConsentFlow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAgree: (rec: ConsentRecord) => void;
  initial?: Partial<Record<Item, boolean>>;
}) {
  const items = consentItems(flow);
  const [checked, setChecked] = useState<Record<Item, boolean>>({
    email: initial?.email ?? false,
    externalAi: initial?.externalAi ?? false,
    location: initial?.location ?? false,
  });
  const [expanded, setExpanded] = useState<Record<Item, boolean>>({ email: true, externalAi: true, location: true });
  const id = useId();
  const all = items.every((k) => checked[k]);
  const requiredOk = items.every((k) => !ITEMS[k].required || checked[k]);

  const agree = () => {
    const rec = saveConsent(flow, {
      email: flow === "member" ? checked.email : false,
      externalAi: checked.externalAi,
      location: checked.location,
    });
    onAgree(rec);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="시작하기 전에 확인해 주세요">
      <CheckRow
        id={`${id}-all`}
        checked={all}
        onCheckedChange={(v) => setChecked((c) => ({ ...c, ...Object.fromEntries(items.map((k) => [k, v])) }))}
        className="text-body-lg"
      >
        <span className="text-[16px] font-bold">모두 동의해요</span>
      </CheckRow>
      <Divider />
      <div className="flex flex-col gap-1">
        {items.map((k) => {
          const it = ITEMS[k];
          const descId = `${id}-${k}-desc`;
          return (
            <div key={k} className="flex items-start gap-1">
              <CheckRow
                id={`${id}-${k}`}
                checked={checked[k]}
                onCheckedChange={(v) => setChecked((c) => ({ ...c, [k]: v }))}
                className="flex-1"
                description={expanded[k] ? <span id={descId}>{it.text}</span> : undefined}
              >
                <span className={cn(it.required ? "text-brand" : "text-ink-muted")}>
                  [{it.required ? "필수" : "선택"}]
                </span>{" "}
                {it.title}
              </CheckRow>
              <button
                type="button"
                aria-label={`${it.title} 내용 ${expanded[k] ? "접기" : "펼치기"}`}
                aria-expanded={expanded[k]}
                onClick={() => setExpanded((e) => ({ ...e, [k]: !e[k] }))}
                className="inline-flex size-touch shrink-0 items-center justify-center rounded-md text-ink-muted"
              >
                <ChevronRight className={cn("size-5 transition-transform", !expanded[k] && "rotate-90")} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <Button disabled={!requiredOk} onClick={agree}>
        동의하고 계속하기
      </Button>
      <p className="m-0 text-center text-caption text-ink-subtle">
        {requiredOk
          ? "처음 한 번만 물어봐요"
          : `필수 항목에 동의해야 ${flow === "member" ? "가입할" : "이용할"} 수 있어요`}{" "}
        · 동의 버전 {CONSENT_VERSION}
      </p>
    </Sheet>
  );
}
