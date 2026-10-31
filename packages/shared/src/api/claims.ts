import { z } from "zod";

/** POST /lost-reports/:id/claims */
export const ClaimRequest = z.object({ foundItemId: z.uuid() });
export type ClaimRequest = z.infer<typeof ClaimRequest>;

const base = {
  attemptId: z.string(),
  /** 설명이 바뀌지 않아 이전 결과를 그대로 돌려줬으면 true (시도 횟수를 쓰지 않음) */
  reused: z.boolean(),
};

const failFields = {
  /** 이 계정에 남은 시도 횟수. 물건이 대면 확인으로 넘어갔으면 0 */
  attemptsLeft: z.number().int().min(0),
  /** 모든 계정의 실패가 쌓여 이 물건은 온라인 확인이 막히고 대면 확인만 된다 (#29) */
  inPersonOnly: z.boolean(),
};

/** 객관식 확인 질문 하나. 정답 위치는 서버만 안다 */
export const ClaimQuestion = z.object({ text: z.string(), options: z.array(z.string()) });
export type ClaimQuestion = z.infer<typeof ClaimQuestion>;

/**
 * 판정 결과. 맞은 항목은 통과했을 때만 준다. 점수는 어떤 경우에도 주지 않는다.
 * matchedFields 예: "feature:sticker", "color", "brand", "place", "time"
 */
export const ClaimResponse = z.discriminatedUnion("result", [
  z.object({ ...base, result: z.literal("PASS"), matchedFields: z.array(z.string()), foundItemId: z.string() }),
  z.object({
    ...base,
    result: z.literal("BORDERLINE"),
    /** 첫 질문 문구 (자유 입력으로 답하던 화면 호환) */
    question: z.string(),
    /** 객관식 질문들. 모두 맞혀야 통과한다. 예전 시도는 빈 배열이라 자유 입력으로 답한다 */
    questions: z.array(ClaimQuestion),
  }),
  z.object({ ...base, result: z.literal("FAIL"), ...failFields }),
  /**
   * 근거 부족: 맞힌 특징도 틀린 특징도 없다. 실패로 세지 않고(attemptsLeft 그대로) 특징을 더 적게 한다 (10/31).
   * 계정·물건마다 1시간에 3번까지, 넘으면 429 RATE_LIMITED
   */
  z.object({ ...base, result: z.literal("NEED_MORE"), message: z.string(), ...failFields }),
]);
export type ClaimResponse = z.infer<typeof ClaimResponse>;

export const AttemptIdParams = z.object({ attemptId: z.uuid() });

/** POST /claims/:attemptId/answer. 자유 입력(answer)이나 객관식 보기 번호(choices, 질문 순서대로) 중 하나 */
export const AnswerRequest = z
  .object({
    answer: z.string().trim().min(1, "답을 적어 주세요.").max(50, "답은 50자 이하로 적어 주세요.").optional(),
    choices: z.array(z.number().int().min(0).max(9)).min(1).max(3).optional(),
  })
  .refine((b) => (b.answer === undefined) !== (b.choices === undefined), { message: "답을 적거나 골라 주세요." });
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const AnswerResponse = z.discriminatedUnion("result", [
  z.object({ result: z.literal("PASS"), foundItemId: z.string() }),
  z.object({ result: z.literal("FAIL"), ...failFields }),
]);
export type AnswerResponse = z.infer<typeof AnswerResponse>;
