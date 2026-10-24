import { CONSENT_VERSION } from "@chajeumpyo/shared";
import { Timer } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Captcha } from "@/components/captcha";
import { ConsentSheet } from "@/components/consent-sheet";
import { BandHero, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckRow } from "@/components/ui/checkbox";
import { SectionLabel } from "@/components/ui/field";
import { Alert } from "@/components/ui/status";
import { useDemoLogin } from "@/data";
import { loadConsent, saveConsent } from "@/lib/consent-store";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";

const STEPS: [string, string][] = [
  ["분실 신고를 써요.", "시연용 습득물이 미리 등록돼 있어요."],
  ["특징을 맞혀요.", "후보에서 내 물건인지 확인해요."],
  ["위치가 열려요.", "사진을 보고 수령 QR을 받아요."],
];

/** C-03 체험 시작: AI 처리 동의 + 캡차 → 체험 계정 → L-03 */
export function DemoStartPage() {
  const navigate = useNavigate();
  const saved = loadConsent("demo");
  const [externalAi, setExternalAi] = useState(saved?.externalAi ?? false);
  const [location, setLocation] = useState(saved?.location ?? false);
  const [sheet, setSheet] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const demo = useDemoLogin();

  const code = demo.isError ? errorCodeOf(demo.error) : null;

  const start = () => {
    if (!token || !externalAi) return;
    saveConsent("demo", { email: false, externalAi, location });
    demo.mutate(
      { consent: { version: CONSENT_VERSION, externalAi: true, location }, captchaToken: token },
      {
        onSuccess: () => navigate("/home", { replace: true }),
        onError: () => {
          setCaptchaReset((n) => n + 1);
          setToken(null);
        },
      },
    );
  };

  return (
    <Screen
      flow="demo"
      header={
        <BandHero variant="demo" back="/" title="체험해 보기">
          체험 계정으로 잃어버린 물건을 찾는 과정을 끝까지 볼 수 있어요. 가입하지 않아도 돼요.
        </BandHero>
      }
      footer={
        <>
          <Button onClick={start} disabled={!externalAi || !token} loading={demo.isPending}>
            {demo.isPending ? "체험 계정을 만드는 중이에요" : "체험 시작하기"}
          </Button>
          <p className="m-0 text-center text-caption text-ink-subtle">체험 기록은 실제 물건 상태를 바꾸지 않아요.</p>
        </>
      }
    >
      {code === "CAPTCHA_FAILED" && (
        <Alert role="alert" tone="fail" title="사람 확인에 실패했어요">
          아래 확인을 다시 눌러 주세요.
        </Alert>
      )}
      {code === "RATE_LIMITED" && (
        <Alert role="alert" tone="review" icon={Timer} title="잠시 후 다시 시도해 주세요">
          짧은 시간에 요청이 많았어요.
        </Alert>
      )}
      {demo.isError && code !== "CAPTCHA_FAILED" && code !== "RATE_LIMITED" && (
        <Alert role="alert" tone="fail" title="체험 계정을 만들지 못했어요">
          {errorMessageOf(demo.error)}
        </Alert>
      )}
      {!demo.isError && (
        <section className="flex flex-col gap-2" aria-labelledby="demo-steps">
          <SectionLabel id="demo-steps">이렇게 체험해요</SectionLabel>
          <Card variant="flat" className="gap-3.5">
            <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
              {STEPS.map(([b, rest], i) => (
                <li key={b} className="flex gap-3 text-[15px] leading-[22px]">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-[13px] font-bold text-ink-muted"
                  >
                    {i + 1}
                  </span>
                  <span>
                    <b className="font-bold">{b}</b> {rest}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      )}
      <div className="flex items-center gap-2">
        <CheckRow id="demo-ai" checked={externalAi} onCheckedChange={setExternalAi} className="flex-1">
          사진 외부 AI 처리에 동의해요 <span className="text-brand">(필수)</span>
        </CheckRow>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="inline-flex min-h-touch min-w-touch items-center justify-center text-[14px] font-semibold text-brand underline underline-offset-4"
        >
          보기
        </button>
      </div>
      <Captcha onToken={setToken} resetKey={captchaReset} />
      <ConsentSheet
        key={String(sheet)}
        flow="demo"
        open={sheet}
        onOpenChange={setSheet}
        initial={{ externalAi, location }}
        onAgree={(rec) => {
          setExternalAi(rec.externalAi);
          setLocation(rec.location);
          setSheet(false);
        }}
      />
    </Screen>
  );
}
