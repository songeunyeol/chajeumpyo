import { z } from "zod";

// API 명세서 1장 "에러 코드". 코드와 HTTP 상태를 한곳에서 관리한다.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  INVALID_EMAIL_DOMAIN: 400,
  INVALID_CODE: 400,
  CAPTCHA_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  MATCH_LOCKED: 409,
  IN_PERSON_REQUIRED: 409,
  ALREADY_CLAIMED: 409,
  ALREADY_ANSWERED: 409,
  INVALID_STORAGE_TYPE: 409,
  NOT_IN_PERSON_ITEM: 409,
  ALREADY_CONFIRMED: 409,
  /** 이미 보관을 끝냈거나 끝낼 수 없는 상태(확정 전, 시드) */
  NOT_CLOSABLE: 409,
  QR_EXPIRED: 410,
  /** 관리자가 보관을 끝냈거나(잘못 등록·폐기) 보관 기한이 지난 물건. 확인·열람·답을 받지 않는다 (10/31 검증) */
  ITEM_CLOSED: 410,
  IMAGE_TOO_LARGE: 413,
  /** JSON 본문이 너무 큼 (express.json 한도) */
  PAYLOAD_TOO_LARGE: 413,
  NO_OBJECT_DETECTED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  AI_UNAVAILABLE: 502,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ErrorCode = z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]]);

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** VALIDATION_ERROR일 때 필드별 오류 */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
