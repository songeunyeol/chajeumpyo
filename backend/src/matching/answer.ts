import type { AnswerVerdict } from "@chajeumpyo/shared";
import { ai } from "../ai";
import { env } from "../config/env";
import { withTimeout } from "../lib/async";
import { compact, stripParticle, words } from "./text";

/**
 * 확인 질문 답 판정 (F-09, open-issues #9, #21)
 * 1) 질문에 나온 낱말을 답에서 지운다 ("스티커"만 답하면 통과하지 못하게)
 * 2) 남은 답이 2글자 이상이고 저장 값에 들어 있으면 정답
 * 3) 아니면 AI에 MATCH / NO_MATCH만 묻는다
 */
export async function judgeAnswer(question: string, stored: string, rawAnswer: string): Promise<AnswerVerdict> {
  const questionWords = new Set(words(question).map(compact));
  const cleaned = words(rawAnswer)
    .map((w) => compact(stripParticle(w)))
    .filter((w) => w.length > 0 && !questionWords.has(w))
    .join("");
  if (cleaned.length === 0) return "NO_MATCH";
  if (cleaned.length >= 2 && compact(stored).includes(cleaned)) return "MATCH";
  return withTimeout(ai.judgeAnswer({ question, stored, answer: cleaned }), env.AI_TIMEOUT_MS, "답 판정");
}
