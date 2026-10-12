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

/** 문장부호·공백으로만 나눈 낱말 (조사를 떼지 않음) */
export function rawWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s.,!?~'"“”‘’·()[\]{}:;-]+/)
    .filter(Boolean);
}

/**
 * 낱말 하나가 될 수 있는 모든 형태: 그대로, 그리고 끝의 조사·어미를 하나씩 뗀 것.
 * "곰돌이요" → {곰돌이요, 곰돌이, 곰돌}. 어느 조사를 떼야 맞는지 모르므로 다 만들어 비교한다.
 */
export function wordForms(word: string): Set<string> {
  const w = compact(word);
  const forms = new Set([w]);
  for (const t of TRAILING) if (w.length > t.length + 1 && w.endsWith(t)) forms.add(w.slice(0, -t.length));
  return forms;
}

/** 두 낱말이 조사 차이만 있고 같은 낱말이면 그 형태를, 아니면 null */
export function sameWord(a: string, b: string): string | null {
  const fb = wordForms(b);
  for (const f of wordForms(a)) if (fb.has(f)) return f;
  return null;
}
