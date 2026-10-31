import {
  AnswerRequest,
  AnswerResponse,
  AttemptIdParams,
  ClaimRequest,
  ClaimResponse,
  LostReportIdParams,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { env } from "../config/env";
import { getAuth, requireMember } from "../middlewares/auth";
import { accountRateLimit, ipRateLimit } from "../middlewares/rate-limit";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as service from "../services/claims";

const json = <T>(schema: T) => ({ content: { "application/json": { schema } } });
const security = [{ bearerAuth: [] }];
const tags = ["일치 판정"];

registry.registerPath({
  method: "post",
  path: "/lost-reports/{id}/claims",
  tags,
  security,
  summary: "내 물건인지 확인 (F-08)",
  description: [
    "이 신고의 지금 후보(상위 3개)나, 이 신고에 보여 준 적 있고 지금도 후보 범위 안인 물건에만 시도할 수 있다.",
    "통과: 사진 특징 75% 이상 일치·모순 0 / 경계: 확인 질문(객관식) / 실패: 맞힌 것 없이 모순, 또는 질문 오답.",
    "근거 부족(NEED_MORE): 맞힌 것도 모순도 없으면 횟수를 쓰지 않고 특징을 더 적게 한다. 계정·물건마다 1시간에 3번까지(넘으면 429).",
    "설명이 그대로면 이전 결과를 reused=true로 돌려주고 횟수를 쓰지 않는다. 맞은 항목은 통과했을 때만 준다.",
  ].join(" "),
  request: { params: LostReportIdParams, body: json(ClaimRequest) },
  responses: {
    200: { description: "판정 결과", ...json(ClaimResponse) },
    400: errorResponse("VALIDATION_ERROR: 닫힌 신고 등"),
    403: errorResponse("FORBIDDEN: 후보가 아닌 물건"),
    404: errorResponse("NOT_FOUND: 없거나 남의 신고"),
    409: errorResponse(
      "MATCH_LOCKED: 이 계정 3회 실패 · IN_PERSON_REQUIRED: 모든 계정 실패 10회로 대면 확인만 · ALREADY_CLAIMED: 이미 수령된 물건",
    ),
    410: errorResponse("ITEM_CLOSED: 보던 물건을 관리자가 정리했거나 보관 기한이 지남"),
    429: errorResponse("RATE_LIMITED: 근거 부족 확인이 1시간에 3번을 넘음 (특징 없는 물건은 교무처 대면 확인 안내)"),
    502: errorResponse("AI_UNAVAILABLE"),
  },
});
registry.registerPath({
  method: "post",
  path: "/claims/{attemptId}/answer",
  tags,
  security,
  summary: "확인 질문 답하기 (F-09)",
  description:
    "질문 하나당 한 번만. choices(객관식 보기 번호, 질문 순서대로)는 모두 맞아야 통과한다. answer(자유 입력)는 질문에 나온 낱말을 빼고 판정한다. 틀리면 실패 횟수가 1 늘어난다.",
  request: { params: AttemptIdParams, body: json(AnswerRequest) },
  responses: {
    200: { description: "답 판정", ...json(AnswerResponse) },
    400: errorResponse("VALIDATION_ERROR: 질문이 없는 시도, 보기 수가 질문 수와 다름"),
    404: errorResponse("NOT_FOUND"),
    409: errorResponse(
      "ALREADY_ANSWERED · IN_PERSON_REQUIRED: 물건이 대면 확인으로 넘어감 · ALREADY_CLAIMED: 이미 수령됨",
    ),
    410: errorResponse("ITEM_CLOSED: 질문을 받은 뒤 관리자가 정리했거나 보관 기한이 지남"),
    429: errorResponse("RATE_LIMITED"),
  },
});

/** 한 계정의 10분 판정·답변 요청 한도 */
export const CLAIM_ACCOUNT_LIMIT = 30;

export function createClaimsRouter() {
  const router = Router();
  const viewer = (res: Parameters<typeof getAuth>[0]) => {
    const a = getAuth(res);
    return { userId: a.userId, role: a.role };
  };

  // 계정·물건별 잠금(3회, 10회)과 별개로, 한 계정이 몰아치는 요청(AI 비용 남용)은 계정 한도로 막는다.
  // IP 한도는 학교 와이파이처럼 한 공인 IP 뒤에 여러 명이 있어도 같이 막히지 않게 넉넉히 둔다 (위협 모델 T2, 10/31 검증 #2)
  const claimLimit = ipRateLimit({
    windowMinutes: 10,
    limit: env.IP_RATE_LIMIT_PER_10MIN,
    message: "이 네트워크에서 확인 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const answerLimit = ipRateLimit({
    windowMinutes: 10,
    limit: env.IP_RATE_LIMIT_PER_10MIN,
    message: "이 네트워크에서 답변 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const claimAccountLimit = accountRateLimit({
    windowMinutes: 10,
    limit: CLAIM_ACCOUNT_LIMIT,
    message: "확인 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const answerAccountLimit = accountRateLimit({
    windowMinutes: 10,
    limit: CLAIM_ACCOUNT_LIMIT,
    message: "답변 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });

  router.post(
    "/lost-reports/:id/claims",
    claimLimit,
    requireMember(),
    claimAccountLimit,
    validate("params", LostReportIdParams),
    validate("body", ClaimRequest),
    async (_req, res) => {
      const result: ClaimResponse = await service.claim(viewer(res), res.locals.params.id, res.locals.body.foundItemId);
      res.json(result);
    },
  );

  router.post(
    "/claims/:attemptId/answer",
    answerLimit,
    requireMember(),
    answerAccountLimit,
    validate("params", AttemptIdParams),
    validate("body", AnswerRequest),
    async (_req, res) => {
      const result: AnswerResponse = await service.answer(viewer(res), res.locals.params.attemptId, res.locals.body);
      res.json(result);
    },
  );

  return router;
}
