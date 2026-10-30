import { randomInt } from "node:crypto";
import { areNeighborColors, COLOR_LABELS, Color } from "@chajeumpyo/shared";
import { looselyContains, rawWords, sameWord } from "./text";

/** 보기 수(정답 포함). 질문 2개면 찍어서 맞힐 확률이 1/16 */
export const QUIZ_OPTIONS = 4;
/** 한 번에 내는 질문 수 */
export const QUIZ_QUESTIONS = 2;
/**
 * 설명에 맞힌 특징이 하나도 없을 때(일치 0) 내는 질문 수. 특징 없이 신고하고 찍는 사칭은 1/64까지 낮춘다 (10/30 코드 평가).
 * 진짜 주인은 사진을 떠올려 답할 수 있지만, 찍는 사람은 질문이 늘수록 급격히 어려워진다.
 */
export const QUIZ_QUESTIONS_NO_EVIDENCE = 3;
/** 찍어서 통과할 확률이 이보다 크면(질문 1개, 보기 4개 미만 등) 온라인으로 통과시키지 않는다 */
export const MAX_GUESS_PROBABILITY = 1 / 16;

/** 모든 질문을 찍어서 맞힐 확률. 질문이 없으면 1 */
export function guessProbability(quiz: QuizQuestion[]): number {
  return quiz.reduce((p, q) => p / Math.max(1, q.options.length), 1);
}

/** 저장하는 객관식 질문. answer(정답 위치)는 응답에 넣지 않는다 */
export type QuizQuestion = { text: string; options: string[]; answer: number; featureKey: string };

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * 두 보기가 같은 것을 가리키는지. 한쪽이 다른 쪽을 품거나, 질문에 없는 낱말을 하나라도 함께 쓰면 겹친다고 본다.
 * "고양이 키링" ↔ "고양이 모양 키링"은 겹치고, "고양이 키링" ↔ "토끼 키링"은 "키링"이 질문에 있어 겹치지 않는다.
 */
export function overlaps(a: string, b: string, question = ""): boolean {
  if (looselyContains(a, b)) return true;
  const asked = rawWords(question);
  const own = (t: string) => rawWords(t).filter((w) => !asked.some((q) => sameWord(w, q) !== null));
  const bw = own(b);
  return own(a).some((w) => bw.some((v) => sameWord(w, v) !== null));
}

/** 정답과도, 서로도 겹치지 않는 오답을 n개까지 고른다. 앞에 있는 후보가 먼저 뽑힌다 */
export function pickDistractors(correct: string[], pool: string[], question = "", n = QUIZ_OPTIONS - 1): string[] {
  const out: string[] = [];
  for (const d of pool) {
    const v = d.trim();
    if (!v || v.length > 30) continue;
    if ([...correct, ...out].some((c) => overlaps(c, v, question))) continue;
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

/**
 * 보기 모양이 비슷한지 (10/30 실서비스 평가: "학번 숫자 / 영문 이니셜 / 짧은 영어 문구 / 안쪽에 J.H 각인"처럼
 * 정답만 구체적이면 바로 티가 난다). 길이, 영문·숫자 포함 여부, 낱말 수가 비슷해야 한다.
 */
export function similarShape(a: string, b: string): boolean {
  const la = a.trim().length;
  const lb = b.trim().length;
  if (Math.abs(la - lb) > Math.max(4, Math.ceil(0.4 * Math.max(la, lb)))) return false;
  const latin = (t: string) => /[A-Za-z]/.test(t);
  const digit = (t: string) => /\d/.test(t);
  if (latin(a) !== latin(b) || digit(a) !== digit(b)) return false;
  const n = (t: string) => t.trim().split(/\s+/).length;
  return Math.abs(n(a) - n(b)) <= 1;
}

/** 같은 자리에 들어갈 수 있는 낱말 묶음. 정답의 낱말 하나를 같은 묶음의 다른 낱말로 바꿔 같은 형식의 오답을 만든다 */
const SWAP_GROUPS: string[][] = [
  ["안쪽", "바깥쪽", "앞면", "뒷면", "옆면", "윗면", "밑면", "가운데", "모서리"],
  ["왼쪽", "오른쪽"],
  ["위쪽", "아래쪽"],
  ["위", "아래"],
  ["앞", "뒤"],
  ["곰돌이", "토끼", "고양이", "강아지", "펭귄", "오리", "공룡", "병아리"],
  ["곰", "토끼", "고양이", "강아지", "펭귄", "오리", "공룡", "여우"],
  ["하트", "별", "꽃", "달", "구름", "나비", "체리", "리본"],
  ["흰색", "검정", "회색", "빨간", "주황", "노란", "초록", "파란", "보라", "분홍", "갈색", "남색"],
  ["줄무늬", "체크무늬", "꽃무늬", "물방울무늬", "격자무늬", "호피무늬"],
  ["금속", "가죽", "실리콘", "아크릴", "고무", "천"],
  ["영화", "버스", "콘서트", "기차", "공연", "전시회"],
  ["티켓", "영수증", "쿠폰", "명함", "사진", "메모지"],
  ["한", "두", "세", "네"],
  ["하나", "두 개", "세 개"],
];
const INITIALS = "ABCDEFGHJKLMNPRSTWY";

function randomLike(token: string): string {
  // 영문 머리글자(J.H, JH, KGB)와 숫자는 같은 모양의 다른 값으로
  // 자리마다 원래와 다른 글자·숫자로 (J.H → S.Y, J.K는 안 됨)
  const other = (pool: string, c: string) => {
    const xs = pool.replace(c, "");
    return xs[randomInt(xs.length)] as string;
  };
  return token.replace(/[A-Z]/g, (c) => other(INITIALS, c)).replace(/\d/g, (c) => other("0123456789", c));
}

/** 정답과 같은 형식으로 핵심 낱말만 바꾼 오답 후보들 */
export function mutateDistractors(correct: string, n = QUIZ_OPTIONS - 1): string[] {
  const out = new Set<string>();
  const latinOrDigit = /[A-Z](?:\.?[A-Z])+\.?|\d+/g;
  for (let tries = 0; tries < 40 && out.size < n; tries++) {
    let next = correct;
    if (latinOrDigit.test(correct)) next = correct.replace(latinOrDigit, (m) => randomLike(m));
    latinOrDigit.lastIndex = 0;
    if (next === correct) {
      // 낱말 단위로 바꾼다 (낱말 앞부분이 묶음 낱말과 같으면 그 부분만: "안쪽에" → "뒷면에")
      const tokens = correct.split(/\s+/);
      const spots: { i: number; hit: string; group: string[] }[] = [];
      tokens.forEach((t, i) => {
        // 낱말마다 가장 길게 맞는 묶음 하나만 ("곰돌이"는 "곰"이 아니라 "곰돌이" 묶음)
        let best: { i: number; hit: string; group: string[] } | null = null;
        for (const g of SWAP_GROUPS) {
          const hit = g.filter((w) => t.startsWith(w)).sort((a, b) => b.length - a.length)[0];
          if (hit && (!best || hit.length > best.hit.length)) best = { i, hit, group: g };
        }
        if (best) spots.push(best);
      });
      // 바꿀 자리를 1~2곳 고른다 ("오른쪽 아래" → "왼쪽 아래", "오른쪽 위", "왼쪽 위")
      const picked = shuffle(spots).slice(0, spots.length > 1 ? 1 + randomInt(2) : 1);
      for (const spot of picked) {
        const others = spot.group.filter((w) => w !== spot.hit);
        const t = tokens[spot.i] as string;
        tokens[spot.i] = (others[randomInt(others.length)] as string) + t.slice(spot.hit.length);
      }
      if (picked.length) next = tokens.join(" ");
    }
    if (next !== correct && !looselyContains(next, correct) && !looselyContains(correct, next)) out.add(next);
  }
  return [...out].slice(0, n);
}

/**
 * 정답과 같은 형식의 오답 3개를 고른다. 순서: AI 오답 → 정답 낱말 바꾸기 → 준비된 보기. 모양이 튀는 것은 뺀다.
 * 3개를 못 채우면 빈 배열(이 질문은 내지 않는다).
 */
export function uniformDistractors(correct: string, aiPool: string[], presets: string[], question = ""): string[] {
  const out: string[] = [];
  const add = (x: string) => {
    const v = x.trim();
    if (out.length >= QUIZ_OPTIONS - 1 || !v || v.length > 30 || !similarShape(v, correct)) return;
    if ([correct, ...out].every((c) => distinctOption(c, v, question))) out.push(v);
  };
  for (const a of aiPool) add(a);
  for (const m of mutateDistractors(correct, QUIZ_OPTIONS)) add(m);
  for (const p of presets) add(p);
  return out.length >= QUIZ_OPTIONS - 1 ? out : [];
}

/**
 * 두 보기가 서로 다른 것을 가리키는지. 낱말이 하나도 안 겹치면 다르다.
 * 같은 형식의 보기("안쪽에 J.H 각인" ↔ "안쪽에 S.Y 각인")는 틀 낱말을 함께 쓰므로, 양쪽에 서로 바뀐 낱말이 있고
 * 그 낱말끼리 겹치지 않으면 다르다고 본다. 한쪽에 꾸밈만 더한 것("고양이 키링" ↔ "고양이 모양 키링")은 같은 것.
 */
export function distinctOption(a: string, b: string, question = ""): boolean {
  if (looselyContains(a, b)) return false;
  if (!overlaps(a, b, question)) return true;
  const asked = rawWords(question);
  const own = (t: string) => rawWords(t).filter((w) => !asked.some((q) => sameWord(w, q) !== null));
  const wa = own(a);
  const wb = own(b);
  const onlyA = wa.filter((w) => !wb.some((v) => sameWord(w, v) !== null));
  const onlyB = wb.filter((w) => !wa.some((v) => sameWord(w, v) !== null));
  if (onlyA.length === 0 || onlyB.length === 0) return false;
  return onlyA.every((x) => onlyB.every((y) => !looselyContains(x, y)));
}

/** 이미 낸 질문의 보기 세트를 순서만 섞어 다시 쓴다. 다시 시도해도 보기 교집합으로 정답을 좁히지 못하게 (10/30) */
export function reshuffle(q: QuizQuestion): QuizQuestion {
  const correct = q.options[q.answer] as string;
  return makeQuestion(
    q.text,
    q.featureKey,
    correct,
    q.options.filter((_, i) => i !== q.answer),
  );
}

/** 정답을 오답 사이 아무 자리에 넣는다 */
export function makeQuestion(text: string, featureKey: string, correct: string, distractors: string[]): QuizQuestion {
  const options = shuffle([correct, ...distractors]);
  return { text, featureKey, options, answer: options.indexOf(correct) };
}

/** 색 질문 오답. 사진 속 색이 조금 달라 보일 수 있어 이웃 색(흰색↔회색 등)은 보기에 넣지 않는다 */
export function colorDistractors(color: Color): string[] {
  const others = Color.options.filter((c) => c !== color && c !== "OTHER" && !areNeighborColors(c, color));
  return shuffle(others.map((c) => COLOR_LABELS[c])).slice(0, QUIZ_OPTIONS - 1);
}

/** 저장된 matchedFields에서 객관식 질문을 꺼낸다. 예전 시도면 빈 배열 */
export function quizOf(matchedFields: unknown): QuizQuestion[] {
  const quiz = (matchedFields as { quiz?: unknown } | null)?.quiz;
  return Array.isArray(quiz) ? (quiz as QuizQuestion[]) : [];
}
