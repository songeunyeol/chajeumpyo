// 한국어 짧은 답·특징 값 비교용 정리 함수

/** 끝에 붙는 조사·어미. 긴 것부터 지운다. */
const TRAILING = [
  "이에요",
  "입니다",
  "이요",
  "예요",
  "에요",
  "이고",
  "인데",
  "이랑",
  "은",
  "는",
  "을",
  "를",
  "가",
  "요",
  "의",
  "에",
];

/** 공백·문장부호 제거, 소문자 */
export function compact(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?~'"“”‘’·()[\]{}:;-]+/g, "");
}

/** 낱말 끝의 조사·어미를 하나 뗀다 */
export function stripParticle(word: string): string {
  for (const t of TRAILING) {
    if (word.length > t.length + 1 && word.endsWith(t)) return word.slice(0, -t.length);
  }
  return word;
}

/** 공백 기준 낱말로 나누고 조사를 뗀다 */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s.,!?~'"“”‘’·()[\]{}:;-]+/)
    .filter(Boolean)
    .map(stripParticle);
}

/** 한쪽이 다른 쪽을 포함하는지 (공백·문장부호 무시) */
export function looselyContains(a: string, b: string): boolean {
  const x = compact(a);
  const y = compact(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}
