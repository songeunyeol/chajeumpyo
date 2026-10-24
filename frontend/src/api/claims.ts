import { AnswerResponse, ClaimResponse } from "@chajeumpyo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AI_TIMEOUT_MS, request } from "@/lib/http";
import { qk } from "./keys";

// L-07 판정 중 → L-08 결과 → L-09 확인 질문

/**
 * L-05 [내 물건이에요] → L-07 → L-08.
 * 결과: PASS(foundItemId로 L-10) / BORDERLINE(question → L-09) / FAIL(attemptsLeft, inPersonOnly. 틀린 항목은 오지 않음)
 * 오류: MATCH_LOCKED(이 계정 3회 소진), IN_PERSON_REQUIRED(물건이 대면 확인으로 넘어감), ALREADY_CLAIMED
 * reused=true면 설명이 그대로라 횟수를 쓰지 않은 이전 결과.
 */
export function useClaim(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ foundItemId }: { foundItemId: string }) =>
      request(`/lost-reports/${reportId}/claims`, {
        json: { foundItemId },
        auth: "member",
        schema: ClaimResponse,
        timeoutMs: AI_TIMEOUT_MS,
      }),
    // 성공·실패 모두 남은 횟수·잠김이 바뀔 수 있다
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.candidates(reportId) });
      void qc.invalidateQueries({ queryKey: qk.notifications("member") });
    },
  });
}

/** L-09: 확인 질문 답(한 번만). 두 번 보내면 ALREADY_ANSWERED */
export function useAnswer(attemptId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { answer: string }) =>
      request(`/claims/${attemptId}/answer`, {
        json: { answer: input.answer },
        auth: "member",
        schema: AnswerResponse,
        timeoutMs: AI_TIMEOUT_MS,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.lostReports });
      void qc.invalidateQueries({ queryKey: qk.notifications("member") });
    },
  });
}
