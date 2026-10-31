import {
  CandidateListResponse,
  CreateLostReportRequest,
  LostReportIdParams,
  LostReportListResponse,
  LostReportWithCandidates,
  UpdateLostReportRequest,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireMember } from "../middlewares/auth";
import { accountRateLimit, ipRateLimit } from "../middlewares/rate-limit";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as service from "../services/lost-reports";

const json = <T>(schema: T) => ({ content: { "application/json": { schema } } });
const security = [{ bearerAuth: [] }];
const tags = ["분실 신고"];

registry.registerPath({
  method: "post",
  path: "/lost-reports",
  tags,
  security,
  summary: "분실 신고 (F-06, F-07)",
  description: "신고 직후 후보 목록을 함께 준다. 후보는 최대 3개, 습득 시각 최신순(점수 순서 아님), 공개 정보만.",
  request: { body: json(CreateLostReportRequest) },
  responses: {
    201: { description: "신고됨", ...json(LostReportWithCandidates) },
    400: errorResponse("VALIDATION_ERROR"),
    401: errorResponse("UNAUTHORIZED"),
    429: errorResponse("RATE_LIMITED"),
    502: errorResponse("AI_UNAVAILABLE: 저장하지 않음"),
  },
});
registry.registerPath({
  method: "get",
  path: "/lost-reports",
  tags,
  security,
  summary: "내 신고 목록",
  responses: { 200: { description: "내 신고", ...json(LostReportListResponse) }, 401: errorResponse("UNAUTHORIZED") },
});
registry.registerPath({
  method: "get",
  path: "/lost-reports/{id}/candidates",
  tags,
  security,
  summary: "후보 조회 (F-07)",
  description: "새 습득물이 등록되면 늘어난다. 닫힌 신고는 빈 목록.",
  request: { params: LostReportIdParams },
  responses: {
    200: { description: "후보", ...json(CandidateListResponse) },
    404: errorResponse("NOT_FOUND: 없거나 남의 신고"),
  },
});
registry.registerPath({
  method: "patch",
  path: "/lost-reports/{id}",
  tags,
  security,
  summary: "신고 닫기·설명 고치기 (F-06)",
  description: "설명을 고치면 다시 분석하고 후보를 다시 고른다. 닫힌 신고는 고칠 수 없다.",
  request: { params: LostReportIdParams, body: json(UpdateLostReportRequest) },
  responses: {
    200: { description: "수정됨", ...json(LostReportWithCandidates) },
    400: errorResponse("VALIDATION_ERROR"),
    404: errorResponse("NOT_FOUND"),
    429: errorResponse("RATE_LIMITED"),
    502: errorResponse("AI_UNAVAILABLE: 수정하지 않음"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/lost-reports/{id}",
  tags,
  security,
  summary: "신고 지우기",
  description:
    "목록·후보·알림에서 빼고 설명·분석 결과·임베딩을 지운다. 확인 시도 기록은 3회·10회 잠금에 쓰이므로 남긴다.",
  request: { params: LostReportIdParams },
  responses: {
    204: { description: "지움" },
    401: errorResponse("UNAUTHORIZED"),
    404: errorResponse("NOT_FOUND: 없거나 남의 신고, 이미 지운 신고"),
  },
});

export function createLostReportsRouter() {
  const router = Router();
  const viewer = (res: Parameters<typeof getAuth>[0]) => {
    const a = getAuth(res);
    return { userId: a.userId, role: a.role };
  };

  // 신고·수정마다 AI 추출과 임베딩을 부른다. 비용 남용과 조건을 바꿔 가며 후보를 훑는 것을 막는다 (10/30 코드 평가)
  const reportIpLimit = ipRateLimit({
    windowMinutes: 10,
    limit: 30,
    message: "신고 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const reportAccountLimit = accountRateLimit({
    windowMinutes: 10,
    limit: 10,
    message: "신고를 너무 자주 만들거나 고쳤어요. 잠시 후 다시 시도해 주세요.",
  });

  router.post(
    "/lost-reports",
    reportIpLimit,
    requireMember(),
    reportAccountLimit,
    validate("body", CreateLostReportRequest),
    async (_req, res) => {
      const result: LostReportWithCandidates = await service.createLostReport(viewer(res), res.locals.body);
      res.status(201).json(result);
    },
  );

  router.get("/lost-reports", requireMember(), async (_req, res) => {
    const result: LostReportListResponse = await service.listLostReports(viewer(res));
    res.json(result);
  });

  router.get(
    "/lost-reports/:id/candidates",
    requireMember(),
    validate("params", LostReportIdParams),
    async (_req, res) => {
      const result: CandidateListResponse = await service.getCandidates(viewer(res), res.locals.params.id);
      res.json(result);
    },
  );

  router.patch(
    "/lost-reports/:id",
    reportIpLimit,
    requireMember(),
    reportAccountLimit,
    validate("params", LostReportIdParams),
    validate("body", UpdateLostReportRequest),
    async (_req, res) => {
      const result: LostReportWithCandidates = await service.updateLostReport(
        viewer(res),
        res.locals.params.id,
        res.locals.body,
      );
      res.json(result);
    },
  );

  router.delete("/lost-reports/:id", requireMember(), validate("params", LostReportIdParams), async (_req, res) => {
    await service.deleteLostReport(viewer(res), res.locals.params.id);
    res.status(204).end();
  });

  return router;
}
