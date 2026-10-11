import {
  AnswerRequest,
  AnswerResponse,
  AttemptIdParams,
  ClaimRequest,
  ClaimResponse,
  LostReportIdParams,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireMember } from "../middlewares/auth";
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
    "이 신고의 현재 후보에만 시도할 수 있다.",
    "통과: 특징 일치 1개 이상·모순 0 / 경계: 일치와 모순이 함께 있으면 확인 질문 / 실패: 일치 0.",
    "설명이 그대로면 이전 결과를 reused=true로 돌려주고 횟수를 쓰지 않는다. 맞은 항목은 통과했을 때만 준다.",
  ].join(" "),
  request: { params: LostReportIdParams, body: json(ClaimRequest) },
  responses: {
    200: { description: "판정 결과", ...json(ClaimResponse) },
    400: errorResponse("VALIDATION_ERROR: 닫힌 신고 등"),
    403: errorResponse("FORBIDDEN: 후보가 아닌 물건"),
    404: errorResponse("NOT_FOUND: 없거나 남의 신고"),
    409: errorResponse("MATCH_LOCKED"),
    502: errorResponse("AI_UNAVAILABLE"),
  },
});
registry.registerPath({
  method: "post",
  path: "/claims/{attemptId}/answer",
  tags,
  security,
  summary: "확인 질문 답하기 (F-09)",
  description: "질문 하나당 한 번만. 질문에 나온 낱말은 답에서 빼고 판정한다. 틀리면 실패 횟수가 1 늘어난다.",
  request: { params: AttemptIdParams, body: json(AnswerRequest) },
  responses: {
    200: { description: "답 판정", ...json(AnswerResponse) },
    400: errorResponse("VALIDATION_ERROR: 질문이 없는 시도"),
    404: errorResponse("NOT_FOUND"),
    409: errorResponse("ALREADY_ANSWERED"),
  },
});

export function createClaimsRouter() {
  const router = Router();
  const viewer = (res: Parameters<typeof getAuth>[0]) => {
    const a = getAuth(res);
    return { userId: a.userId, role: a.role };
  };

  router.post(
    "/lost-reports/:id/claims",
    requireMember(),
    validate("params", LostReportIdParams),
    validate("body", ClaimRequest),
    async (_req, res) => {
      const result: ClaimResponse = await service.claim(viewer(res), res.locals.params.id, res.locals.body.foundItemId);
      res.json(result);
    },
  );

  router.post(
    "/claims/:attemptId/answer",
    requireMember(),
    validate("params", AttemptIdParams),
    validate("body", AnswerRequest),
    async (_req, res) => {
      const result: AnswerResponse = await service.answer(
        viewer(res),
        res.locals.params.attemptId,
        res.locals.body.answer,
      );
      res.json(result);
    },
  );

  return router;
}
