import type { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

// Cloudflare Turnstile 캡차 (open-issues #38, 위협 모델 T8, QA W4).
// 프론트는 위젯에서 받은 토큰을 X-Captcha-Token 헤더로 보낸다(multipart 요청에도 쓸 수 있게 본문이 아니라 헤더).

export const CAPTCHA_HEADER = "x-captcha-token";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

export type CaptchaVerifier = (input: { secret: string; token: string; ip: string }) => Promise<boolean>;

/** Turnstile 검증 API 호출. 오류·시간 초과는 실패로 본다(막는 쪽이 기본) */
const turnstileVerifier: CaptchaVerifier = async ({ secret, token, ip }) => {
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Turnstile 응답 ${res.status}`);
  const body = (await res.json()) as { success?: unknown };
  return body.success === true;
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

/** CAPTCHA_MODE=off(개발)면 그냥 통과한다. production에서는 끌 수 없다(config/env.ts) */
export function requireCaptcha(): RequestHandler {
  return async (req, _res, next) => {
    if (env.CAPTCHA_MODE === "off") return next();
    const token = req.get(CAPTCHA_HEADER);
    if (!token || token.length > 2048) return next(failed());
    let ok = false;
    try {
      ok = await verifier({ secret: env.TURNSTILE_SECRET_KEY as string, token, ip: req.ip ?? "" });
    } catch (err) {
      logger.warn({ err }, "캡차 검증 실패 → 막음");
    }
    next(ok ? undefined : failed());
  };
}
