import { pino } from "pino";
import { env } from "../config/env";

/**
 * 요청 로그에는 메서드·경로·상태·시간만 남긴다 (open-issues #34, 위협 모델 T5).
 * 쿼리 문자열(좌표·토큰이 들어갈 수 있음)과 헤더(Authorization 토큰), 원격 주소는 남기지 않는다.
 */
export const requestLogSerializers = {
  req: (req: { id?: unknown; method?: string; url?: string }) => ({
    id: req.id,
    method: req.method,
    path: (req.url ?? "").split("?")[0],
  }),
  res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
};

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
});
