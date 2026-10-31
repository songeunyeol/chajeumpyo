import { randomInt } from "node:crypto";

/**
 * 카메라 없이 불러 주고 받아 적는 8자리 수령 코드 (#13).
 * 헷갈리는 글자(0·O, 1·I·L)를 뺀 31자에서 고른다. 31^8 ≈ 8.5e11 가지.
 */
export const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SHORT_CODE_LENGTH = 8;

/** 새 코드. 저장·비교용 정규형(하이픈 없는 대문자 8자) */
export function newShortCode(): string {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  return code;
}

/** 화면 표시용: ABCD-EFGH */
export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * 사람이 넣은 값을 정규형으로. 공백·하이픈을 지우고 대문자로 바꾼다.
 * 8자가 아니거나 쓰지 않는 글자가 섞이면 null (긴 QR 토큰도 null).
 */
export function normalizeShortCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== SHORT_CODE_LENGTH) return null;
  for (const ch of code) if (!SHORT_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
