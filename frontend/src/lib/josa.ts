/** 마지막 글자에 받침이 있으면 true */
export function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return false;
  return c % 28 !== 0;
}

/** 을/를, 은/는, 이/가, 으로/로 */
export function josa(word: string, pair: "을/를" | "은/는" | "이/가" | "으로/로"): string {
  const [a, b] = pair.split("/") as [string, string];
  if (pair === "으로/로") {
    const c = word.charCodeAt(word.length - 1) - 0xac00;
    const jong = c >= 0 && c <= 11171 ? c % 28 : 0;
    return word + (jong !== 0 && jong !== 8 ? a : b);
  }
  return word + (hasBatchim(word) ? a : b);
}

/** "AbCdEfGh1234" → "AbCd EfGh 1234" (보기용. 대소문자 그대로) */
export function groupToken(token: string, size = 4): string {
  return (token.match(new RegExp(`.{1,${size}}`, "g")) ?? []).join(" ");
}
