import { ERROR_STATUS, type ErrorCode } from "@chajeumpyo/shared";

/** 라우트·서비스에서 던지면 에러 미들웨어가 API 명세의 에러 형식으로 바꾼다. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.status = ERROR_STATUS[code];
  }
}
