import { ERROR_STATUS, type ErrorCode } from "@chajeumpyo/shared";

/**
 * API 오류에서 에러 코드를 꺼낸다. 연결 작업의 http 오류 객체가 `code`(ErrorCode)와 `status`를 가진다고 본다.
 * 모르는 모양이면 null(네트워크 오류 등).
 */
export function errorCodeOf(err: unknown): ErrorCode | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string" && code in ERROR_STATUS) return code as ErrorCode;
  }
  return null;
}

export function errorStatusOf(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number") return s;
  }
  const code = errorCodeOf(err);
  return code ? ERROR_STATUS[code] : null;
}

/** 에러 코드별 기본 문구. 화면마다 더 구체적인 문구가 있으면 그것을 쓴다. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "입력한 내용을 다시 확인해 주세요.",
  INVALID_EMAIL_DOMAIN: "서경대 학교 이메일(@skuniv.ac.kr)만 쓸 수 있어요.",
  INVALID_CODE: "인증 코드가 맞지 않아요.",
  CAPTCHA_FAILED: "사람인지 확인하지 못했어요. 다시 시도해 주세요.",
  UNAUTHORIZED: "다시 로그인해 주세요.",
  FORBIDDEN: "이 화면을 볼 권한이 없어요.",
  NOT_FOUND: "찾는 내용이 없어요.",
  EMAIL_TAKEN: "이미 가입한 이메일이에요. 로그인해 주세요.",
  MATCH_LOCKED: "이 물건은 확인 횟수를 모두 썼어요.",
  IN_PERSON_REQUIRED: "이 물건은 보관처에서 직접 확인해야 해요.",
  ALREADY_CLAIMED: "이미 주인이 찾아간 물건이에요.",
  ALREADY_ANSWERED: "확인 질문에는 한 번만 답할 수 있어요.",
  INVALID_STORAGE_TYPE: "보관 방식이 맞지 않아요.",
  NOT_IN_PERSON_ITEM: "대면 확인 물건이 아니에요.",
  QR_EXPIRED: "QR이 만료됐어요. 새로 받아 주세요.",
  IMAGE_TOO_LARGE: "사진 용량이 너무 커요.",
  NO_OBJECT_DETECTED: "사진에서 물건을 찾지 못했어요.",
  RATE_LIMITED: "요청이 너무 잦아요. 잠시 뒤에 다시 해 주세요.",
  INTERNAL_ERROR: "잠시 문제가 생겼어요. 다시 시도해 주세요.",
  AI_UNAVAILABLE: "사진 분석이 잠시 안 돼요. 다시 시도해 주세요.",
};

export function errorMessageOf(err: unknown, fallback = "연결이 불안정해요. 다시 시도해 주세요."): string {
  const code = errorCodeOf(err);
  if (code) return ERROR_MESSAGES[code];
  return fallback;
}
