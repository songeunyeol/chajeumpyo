import type { AnswerResponse, ClaimResponse } from "@chajeumpyo/shared";
import type { ClaimView } from "@/components/claim-result";
import { errorCodeOf, errorMessageOf } from "./errors";

type FailLike = { attemptsLeft: number; inPersonOnly: boolean };

function fromFail(r: FailLike): ClaimView {
  if (r.inPersonOnly) return { kind: "inperson" };
  if (r.attemptsLeft <= 0) return { kind: "locked" };
  return { kind: "fail", attemptsLeft: r.attemptsLeft };
}

/** 판정 응답 → L-08 화면. 실패 응답에는 항목 정보가 없고, 화면도 만들지 않는다 */
export function viewFromClaim(r: ClaimResponse | AnswerResponse): ClaimView {
  if (r.result === "PASS") return { kind: "pass", matchedFields: "matchedFields" in r ? r.matchedFields : [] };
  if (r.result === "BORDERLINE") return { kind: "question" };
  return fromFail(r);
}

/** 판정 오류 → L-08 화면 (409 IN_PERSON_REQUIRED → 대면 확인, MATCH_LOCKED → 잠김) */
export function viewFromClaimError(err: unknown): ClaimView {
  switch (errorCodeOf(err)) {
    case "IN_PERSON_REQUIRED":
      return { kind: "inperson" };
    case "MATCH_LOCKED":
      return { kind: "locked" };
    case "ALREADY_CLAIMED":
      return { kind: "claimed" };
    default:
      return { kind: "error", message: errorMessageOf(err) };
  }
}

export const REUSED_TOAST = "이전 결과예요. 횟수는 그대로예요.";
