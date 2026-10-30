import type { ErrorResponse } from "@chajeumpyo/shared";
import { rateLimit } from "express-rate-limit";

/** IP 기준 요청 제한. 앱마다 새로 만들어 테스트끼리 카운트가 섞이지 않게 한다. */
export function ipRateLimit(options: { windowMinutes: number; limit: number; message: string }) {
  const body: ErrorResponse = { error: { code: "RATE_LIMITED", message: options.message } };
  return rateLimit({
    windowMs: options.windowMinutes * 60_000,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(body);
    },
  });
}

/**
 * 로그인한 계정 기준 요청 제한. requireMember() 뒤에 둔다.
 * IP를 바꿔 가며 같은 계정으로 몰아치는 요청(예: 조건을 바꿔 후보 훑기, AI 비용 남용)을 막는다.
 */
export function accountRateLimit(options: { windowMinutes: number; limit: number; message: string }) {
  const body: ErrorResponse = { error: { code: "RATE_LIMITED", message: options.message } };
  return rateLimit({
    windowMs: options.windowMinutes * 60_000,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (_req, res) =>
      `account:${(res.locals as { auth?: { userId?: string } }).auth?.userId ?? "anonymous"}`,
    handler: (_req, res) => {
      res.status(429).json(body);
    },
  });
}
