import {
  AdminFoundItemDetailResponse,
  AdminFoundItemListQuery,
  AdminFoundItemListResponse,
  AdminUpdateFoundItemRequest,
  FoundItemIdParams,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireAdmin } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as service from "../services/admin-found-items";

const json = <T>(schema: T) => ({ content: { "application/json": { schema } } });
const security = [{ bearerAuth: [] }];
const tags = ["관리자"];
const scopeNote = "경비실 관리자는 자기 보관처 물건만, 종합서비스센터·보관처 없는 관리자는 전체.";

registry.registerPath({
  method: "get",
  path: "/admin/found-items",
  tags,
  security,
  summary: "습득물 목록 (F-14)",
  description: `상태로 거를 수 있다(예: REVIEW). 20개씩, 습득 시각 최신순. ${scopeNote}`,
  request: { query: AdminFoundItemListQuery },
  responses: { 200: { description: "목록", ...json(AdminFoundItemListResponse) }, 403: errorResponse("FORBIDDEN") },
});
registry.registerPath({
  method: "get",
  path: "/admin/found-items/{id}",
  tags,
  security,
  summary: "습득물 상세 (F-14)",
  description: `공개·비공개 정보, 원본·공개본 사진 링크(10분), 시도·열람·수령 기록(이메일은 가림). ${scopeNote}`,
  request: { params: FoundItemIdParams },
  responses: {
    200: { description: "상세", ...json(AdminFoundItemDetailResponse) },
    403: errorResponse("FORBIDDEN: 관리 범위 밖"),
    404: errorResponse("NOT_FOUND"),
  },
});
registry.registerPath({
  method: "patch",
  path: "/admin/found-items/{id}",
  tags,
  security,
  summary: "속성 고치기, 검토 대기 → 등록 (F-14)",
  description: "status=REGISTERED는 검토 대기 물건에만(종류·설명 필요). 등록하면 새 후보 알림을 보낸다.",
  request: { params: FoundItemIdParams, body: json(AdminUpdateFoundItemRequest) },
  responses: {
    200: { description: "수정 후 상세", ...json(AdminFoundItemDetailResponse) },
    400: errorResponse("VALIDATION_ERROR"),
    403: errorResponse("FORBIDDEN"),
    404: errorResponse("NOT_FOUND"),
    502: errorResponse("AI_UNAVAILABLE: 임베딩 실패, 저장 안 함"),
  },
});

export function createAdminRouter() {
  const router = Router();
  const admin = (res: Parameters<typeof getAuth>[0]) => {
    const a = getAuth(res);
    return { userId: a.userId, storagePlaceId: a.storagePlaceId };
  };

  router.get("/admin/found-items", requireAdmin(), validate("query", AdminFoundItemListQuery), async (_req, res) => {
    const result: AdminFoundItemListResponse = await service.listFoundItems(admin(res), res.locals.query);
    res.json(result);
  });

  router.get("/admin/found-items/:id", requireAdmin(), validate("params", FoundItemIdParams), async (_req, res) => {
    const result: AdminFoundItemDetailResponse = await service.getFoundItem(admin(res), res.locals.params.id);
    res.json(result);
  });

  router.patch(
    "/admin/found-items/:id",
    requireAdmin(),
    validate("params", FoundItemIdParams),
    validate("body", AdminUpdateFoundItemRequest),
    async (_req, res) => {
      const result: AdminFoundItemDetailResponse = await service.updateFoundItem(
        admin(res),
        res.locals.params.id,
        res.locals.body,
      );
      res.json(result);
    },
  );

  return router;
}
