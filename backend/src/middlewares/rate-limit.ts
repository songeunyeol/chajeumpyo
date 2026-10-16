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
