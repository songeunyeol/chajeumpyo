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

/**
 * 판정 결과. 맞은 항목은 통과했을 때만 준다. 점수는 어떤 경우에도 주지 않는다.
 * matchedFields 예: "feature:sticker", "color", "brand", "place", "time"
 */
export const ClaimResponse = z.discriminatedUnion("result", [
  z.object({ ...base, result: z.literal("PASS"), matchedFields: z.array(z.string()), foundItemId: z.string() }),
  z.object({ ...base, result: z.literal("BORDERLINE"), question: z.string() }),
  z.object({ ...base, result: z.literal("FAIL"), ...failFields }),
]);
export type ClaimResponse = z.infer<typeof ClaimResponse>;

export const AttemptIdParams = z.object({ attemptId: z.uuid() });

/** POST /claims/:attemptId/answer */
export const AnswerRequest = z.object({
  answer: z.string().trim().min(1, "답을 적어 주세요.").max(50, "답은 50자 이하로 적어 주세요."),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const AnswerResponse = z.discriminatedUnion("result", [
  z.object({ result: z.literal("PASS"), foundItemId: z.string() }),
  z.object({ result: z.literal("FAIL"), ...failFields }),
]);
export type AnswerResponse = z.infer<typeof AnswerResponse>;
