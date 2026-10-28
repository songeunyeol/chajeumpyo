import type { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

// Cloudflare Turnstile 캡차 (open-issues #38, 위협 모델 T8, QA W4).
// 프론트는 위젯에서 받은 토큰을 X-Captcha-Token 헤더로 보낸다(multipart 요청에도 쓸 수 있게 본문이 아니라 헤더).

export const CAPTCHA_HEADER = "x-captcha-token";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

/** siteverify 응답 중 서버가 확인하는 값 */
export type CaptchaVerifyResult = { success: boolean; hostname?: string; action?: string };
export type CaptchaVerifier = (input: { secret: string; token: string; ip: string }) => Promise<CaptchaVerifyResult>;

/** Turnstile 검증 API 호출. 오류·시간 초과는 실패로 본다(막는 쪽이 기본) */
const turnstileVerifier: CaptchaVerifier = async ({ secret, token, ip }) => {
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Turnstile 응답 ${res.status}`);
  const body = (await res.json()) as { success?: unknown; hostname?: unknown; action?: unknown };
  return {
    success: body.success === true,
    hostname: typeof body.hostname === "string" ? body.hostname : undefined,
    action: typeof body.action === "string" ? body.action : undefined,
  };
};

let verifier: CaptchaVerifier = turnstileVerifier;

/** 테스트에서 검증 API를 바꿔 끼운다 */
export function setCaptchaVerifier(v: CaptchaVerifier) {
  verifier = v;
}
export function resetCaptchaVerifier() {
  verifier = turnstileVerifier;
}

const failed = () => new AppError("CAPTCHA_FAILED", "사람인지 확인하지 못했어요. 다시 시도해 주세요.");

/**
 * 위젯의 action 이름. 프론트 위젯의 action과 같아야 한다(다른 화면에서 받은 토큰을 돌려쓰지 못하게).
 * 찾은 사람 사진 화면(frontend/found/captcha.js)은 "found-analyze"로 받는다.
 */
export const CAPTCHA_ACTIONS = {
  /** 습득물 분석·등록 (POST /found-items/analyze, POST /found-items) */
  foundAnalyze: "found-analyze",
  /** 인증 코드 요청 (POST /auth/email/code) */
  emailCode: "email-code",
  /** 체험 로그인 (POST /auth/demo) */
  demoLogin: "demo-login",
} as const;
export type CaptchaAction = (typeof CAPTCHA_ACTIONS)[keyof typeof CAPTCHA_ACTIONS];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * 토큰을 받은 페이지의 호스트로 허용하는 값. TURNSTILE_HOSTNAMES(쉼표)가 있으면 그것, 없으면 PUBLIC_BASE_URL의 호스트.
 * production이 아니고 허용 호스트가 localhost뿐이면 확인하지 않는다(로컬 개발·Cloudflare 테스트 키는 hostname이 다르다).
 */
function allowedHostnames(): Set<string> | null {
  const list = env.TURNSTILE_HOSTNAMES
    ? env.TURNSTILE_HOSTNAMES.split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    : [new URL(env.PUBLIC_BASE_URL).hostname.toLowerCase()];
  if (env.NODE_ENV !== "production" && list.every((h) => LOCAL_HOSTS.has(h))) return null;
  return new Set(list);
}

/**
 * CAPTCHA_MODE=off(개발)면 그냥 통과한다. production에서는 끌 수 없다(config/env.ts).
 * success뿐 아니라 hostname(우리 사이트에서 받은 토큰인지)과 action(이 요청용 위젯인지)도 확인한다.
 * expectedActions를 주지 않으면 action은 확인하지 않는다.
 */
export function requireCaptcha(...expectedActions: CaptchaAction[]): RequestHandler {
  return async (req, _res, next) => {
    if (env.CAPTCHA_MODE === "off") return next();
    const token = req.get(CAPTCHA_HEADER);
    if (!token || token.length > 2048) return next(failed());
    let ok = false;
    try {
      const result = await verifier({ secret: env.TURNSTILE_SECRET_KEY as string, token, ip: req.ip ?? "" });
      const hosts = allowedHostnames();
      const hostOk = !hosts || (!!result.hostname && hosts.has(result.hostname.toLowerCase()));
      const actionOk =
        expectedActions.length === 0 || (!!result.action && (expectedActions as string[]).includes(result.action));
      ok = result.success && hostOk && actionOk;
      if (result.success && !ok) {
        logger.warn(
          { hostname: result.hostname, action: result.action, path: req.path },
          "캡차 호스트·action 불일치 → 막음",
        );
      }
    } catch (err) {
      logger.warn({ err }, "캡차 검증 실패 → 막음");
    }
    next(ok ? undefined : failed());
  };
}
