import { Check, CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY } from "@/lib/env";
import { cn } from "@/lib/utils";

/** 개발 중(사이트 키 없음)에 보내는 통과 토큰. 백엔드 CAPTCHA_MODE=off일 때만 통과한다 */
export const DEV_CAPTCHA_TOKEN = "dev-pass";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export type CaptchaMode = "turnstile" | "dev" | "misconfigured";

/** 사이트 키가 있으면 Turnstile. 없으면 개발 빌드는 개발용 상자, 배포 빌드는 설정 오류(통과 토큰을 절대 보내지 않음) */
export function resolveCaptchaMode(siteKey: string, isProd: boolean): CaptchaMode {
  if (siteKey) return "turnstile";
  return isProd ? "misconfigured" : "dev";
}

/**
 * 캡차 (Cloudflare Turnstile). resetKey가 바뀌면 다시 확인하게 한다 (CAPTCHA_FAILED 뒤).
 * mode는 테스트용으로만 넘긴다.
 */
export function Captcha({
  onToken,
  resetKey = 0,
  mode = resolveCaptchaMode(TURNSTILE_SITE_KEY, import.meta.env.PROD),
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
  mode?: CaptchaMode;
}) {
  if (mode === "misconfigured") return <CaptchaConfigError />;
  if (mode === "dev") return <DevCaptcha onToken={onToken} resetKey={resetKey} />;
  return <TurnstileWidget onToken={onToken} resetKey={resetKey} />;
}

function CaptchaConfigError() {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-md bg-fail-bg px-3.5 py-3 text-[14px] leading-5">
      <CircleAlert className="size-5 shrink-0 text-fail" aria-hidden />
      <div>
        <b className="block font-bold">사람 확인을 준비하지 못했어요</b>
        서비스 설정(캡차 사이트 키)이 빠져 있어 지금은 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.
      </div>
    </div>
  );
}

function DevCaptcha({ onToken, resetKey }: { onToken: (t: string | null) => void; resetKey: number }) {
  const [ok, setOk] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey가 바뀔 때만 초기화
  useEffect(() => {
    setOk(false);
    onToken(null);
  }, [resetKey]);
  return (
    // biome-ignore lint/a11y/useSemanticElements: Turnstile 모양의 큰 확인 상자라 button+role=checkbox로 만든다
    <button
      type="button"
      role="checkbox"
      aria-checked={ok}
      onClick={() => {
        const next = !ok;
        setOk(next);
        onToken(next ? DEV_CAPTCHA_TOKEN : null);
      }}
      className="flex h-[65px] w-full items-center gap-3 rounded-sm border border-line-strong bg-[#FAFAFA] px-3.5 text-left text-[14px]"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-[26px] items-center justify-center rounded-[4px] border-2 border-[#9AA09B] bg-white",
          ok && "border-pass bg-pass text-white",
        )}
      >
        {ok && <Check className="size-4 stroke-[3]" />}
      </span>
      {ok ? "사람인지 확인했어요" : "사람인지 확인해 주세요"}
      <small className="ml-auto text-right text-[10px] leading-3 text-ink-subtle">
        Cloudflare
        <br />
        Turnstile
      </small>
    </button>
  );
}

function TurnstileWidget({ onToken, resetKey }: { onToken: (t: string | null) => void; resetKey: number }) {
  const el = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !el.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(el.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: "ko",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      cb.current(null);
    }
  }, [resetKey]);

  if (failed) {
    return <p className="m-0 text-small text-fail">사람 확인 도구를 불러오지 못했어요. 새로고침해 주세요.</p>;
  }
  return <div ref={el} className="min-h-[65px]" />;
}
