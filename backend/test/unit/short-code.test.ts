// 8자리 수령 코드 (10/31 검증 #13)
import { describe, expect, it } from "vitest";
import {
  formatShortCode,
  newShortCode,
  normalizeShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from "../../src/lib/short-code";

describe("수령 코드", () => {
  it("헷갈리는 글자(0·O·1·I·L)를 쓰지 않는다", () => {
    for (const ch of "0O1IL") expect(SHORT_CODE_ALPHABET).not.toContain(ch);
    expect(new Set(SHORT_CODE_ALPHABET).size).toBe(SHORT_CODE_ALPHABET.length);
  });

  it("새 코드는 8자, 알파벳 안의 글자만", () => {
    for (let i = 0; i < 200; i++) {
      const code = newShortCode();
      expect(code).toHaveLength(SHORT_CODE_LENGTH);
      for (const ch of code) expect(SHORT_CODE_ALPHABET).toContain(ch);
    }
  });

  it("표시는 ABCD-EFGH, 넣은 값은 대소문자·하이픈·공백을 무시한다", () => {
    expect(formatShortCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(normalizeShortCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeShortCode("abcd efgh")).toBe("ABCDEFGH");
  });

  it("길이가 다르거나 쓰지 않는 글자, 긴 QR 토큰은 null", () => {
    expect(normalizeShortCode("ABCD-EFG")).toBeNull();
    expect(normalizeShortCode("ABCD-EFG0")).toBeNull();
    expect(normalizeShortCode("pk_abcdefghijklmnopqrstuvwx")).toBeNull();
  });
});
