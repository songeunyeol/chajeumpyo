import { Check } from "lucide-react";
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

/**
 * 캡차 (Cloudflare Turnstile). 사이트 키가 없으면 개발용 확인 상자를 보여 주고 통과 토큰을 준다.
 * resetKey가 바뀌면 다시 확인하게 한다 (CAPTCHA_FAILED 뒤).
 */
export function Captcha({ onToken, resetKey = 0 }: { onToken: (token: string | null) => void; resetKey?: number }) {
  if (!TURNSTILE_SITE_KEY) return <DevCaptcha onToken={onToken} resetKey={resetKey} />;
  return <TurnstileWidget onToken={onToken} resetKey={resetKey} />;
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
