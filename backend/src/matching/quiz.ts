import { randomInt } from "node:crypto";
import { areNeighborColors, COLOR_LABELS, Color } from "@chajeumpyo/shared";
import { looselyContains, rawWords, sameWord } from "./text";

/** 보기 수(정답 포함). 질문 2개면 찍어서 맞힐 확률이 1/16 */
export const QUIZ_OPTIONS = 4;
/** 한 번에 내는 질문 수 */
export const QUIZ_QUESTIONS = 2;

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
