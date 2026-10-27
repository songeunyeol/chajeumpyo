import type { AnswerVerdict } from "@chajeumpyo/shared";
import { ai } from "../ai";
import { env } from "../config/env";
import { withTimeout } from "../lib/async";
import { rawWords, sameWord } from "./text";

/** 답 최대 길이. 요청 검증과 같은 값으로, 판정 함수에서도 한 번 더 막는다 */
export const ANSWER_MAX_LENGTH = 50;

/**
 * 확인 질문 답 판정 (F-09, open-issues #9, #21, 리뷰 PR #10)
 * 1) 질문에 나온 낱말을 답에서 지운다 ("스티커"만 답하면 통과하지 못하게)
 * 2) 남은 낱말이 모두 저장 값의 낱말과 **낱말 단위로** 같고, 2글자 이상 낱말이 하나라도 있으면 정답.
 *    부분 문자열("돌이" ↔ "곰돌이")은 정답으로 보지 않는다.
 * 3) 아니면 AI에 MATCH / NO_MATCH만 묻는다. 답은 데이터로만 넘긴다(프롬프트 인젝션 방지는 AI 구현에서).
 */
export async function judgeAnswer(question: string, stored: string, rawAnswer: string): Promise<AnswerVerdict> {
  if (rawAnswer.length > ANSWER_MAX_LENGTH) return "NO_MATCH";
  const questionWords = rawWords(question);
  const answerWords = rawWords(rawAnswer).filter((w) => !questionWords.some((q) => sameWord(w, q) !== null));
  if (answerWords.length === 0) return "NO_MATCH";
  const storedWords = rawWords(stored);
  const matched = answerWords.map((w) => storedWords.map((s) => sameWord(w, s)).find((f) => f !== null) ?? null);
  if (matched.every((f) => f !== null) && matched.some((f) => (f as string).length >= 2)) return "MATCH";
  return withTimeout(ai.judgeAnswer({ question, stored, answer: answerWords.join(" ") }), env.AI_TIMEOUT_MS, "답 판정");
}
