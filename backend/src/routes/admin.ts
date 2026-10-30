import {
  AdminCloseFoundItemRequest,
  AdminFoundItemDetailResponse,
  AdminFoundItemListQuery,
  AdminFoundItemListResponse,
  AdminUpdateFoundItemRequest,
  FoundItemIdParams,
  HotspotQuery,
  HotspotResponse,
  InPersonPickupRequest,
  InPersonPickupResponse,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireAdmin } from "../middlewares/auth";
import { ipRateLimit } from "../middlewares/rate-limit";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as service from "../services/admin-found-items";
import { demoHotspots } from "../services/demo-hotspots";
import { hotspots } from "../services/hotspots";
import { completeInPersonPickup } from "../services/pickups";

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
registry.registerPath({
  method: "post",
  path: "/admin/found-items/{id}/in-person-pickup",
  tags,
  security,
  summary: "대면 확인 후 수령 완료 (#29)",
  description: `모든 계정의 확인 실패가 10회에 닿아 온라인 확인이 막힌 물건(claimLockedAt)을, 관리자가 신분을 직접 확인하고 내준다. 처리 관리자와 신분 확인 메모를 남기고, 메모는 수령 기록과 함께 30일 뒤 지운다. 신분증 번호 전체는 적지 않는다. 물건의 사진·비공개 정보는 바로 지운다. ${scopeNote}`,
  request: { params: FoundItemIdParams, body: json(InPersonPickupRequest) },
  responses: {
    200: { description: "수령 완료", ...json(InPersonPickupResponse) },
    400: errorResponse("VALIDATION_ERROR: 메모가 비었거나 200자 초과"),
    403: errorResponse("FORBIDDEN: 관리 범위 밖"),
    404: errorResponse("NOT_FOUND"),
    409: errorResponse("ALREADY_CLAIMED · NOT_IN_PERSON_ITEM: 대면 확인으로 넘어간 보관 중 물건이 아님"),
  },
});

registry.registerPath({
  method: "post",
  path: "/admin/found-items/{id}/close",
  tags,
  security,
  summary: "보관 종료 (폐기·이관 / 잘못 등록)",
  description: `행은 지우지 않고 기한 만료로 바꿔 후보·공개 목록에서 뺀다. 이유·처리 관리자·시각을 남기고, 받아 간 수령 QR은 만료시킨다. 잘못 등록이면 사진과 비공개 정보를 바로 지운다. 수령된 물건·체험용 물건은 끝낼 수 없다. ${scopeNote}`,
  request: { params: FoundItemIdParams, body: json(AdminCloseFoundItemRequest) },
  responses: {
    200: { description: "끝낸 뒤 상세", ...json(AdminFoundItemDetailResponse) },
    400: errorResponse("VALIDATION_ERROR"),
    403: errorResponse("FORBIDDEN: 관리 범위 밖"),
    404: errorResponse("NOT_FOUND"),
    409: errorResponse("ALREADY_CLAIMED · NOT_CLOSABLE: 이미 끝났거나 확정 전·체험용 물건"),
  },
});

registry.registerPath({
  method: "get",
  path: "/admin/stats/hotspots",
  tags,
  security,
  summary: "분실 다발 카드 (F-15)",
  description:
    "습득물 등록 건수를 건물·시간대(한국 시간)·종류별로 집계. 기간은 한국 날짜, 생략하면 최근 30일. 실제 데이터만 집계하고, 없으면 시드로 집계해 isSeedData=true. 모든 관리자가 캠퍼스 전체를 본다.",
  request: { query: HotspotQuery },
  responses: { 200: { description: "집계", ...json(HotspotResponse) }, 400: errorResponse("VALIDATION_ERROR") },
});

registry.registerPath({
  method: "get",
  path: "/demo/admin/stats/hotspots",
  tags,
  summary: "관리자 시연용 분실 다발 카드",
  description:
    "로그인 없이 관리자 시연 모드에서 쓴다. DB를 읽지 않고 서버 메모리의 시연 데이터(날짜는 오늘 기준 상대값)를 실제 통계와 같은 집계 함수로 계산한다. 학생 데이터·개인정보 없음. 항상 isSeedData=true.",
  request: { query: HotspotQuery },
  responses: {
    200: { description: "집계", ...json(HotspotResponse) },
    400: errorResponse("VALIDATION_ERROR"),
    429: errorResponse("RATE_LIMITED"),
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

  router.post(
    "/admin/found-items/:id/in-person-pickup",
    requireAdmin(),
    validate("params", FoundItemIdParams),
    validate("body", InPersonPickupRequest),
    async (_req, res) => {
      const result: InPersonPickupResponse = await completeInPersonPickup(
        admin(res),
        res.locals.params.id,
        res.locals.body.verificationNote,
      );
      res.json(result);
    },
  );

  router.post(
    "/admin/found-items/:id/close",
    requireAdmin(),
    validate("params", FoundItemIdParams),
    validate("body", AdminCloseFoundItemRequest),
    async (_req, res) => {
      const result: AdminFoundItemDetailResponse = await service.closeFoundItem(
        admin(res),
        res.locals.params.id,
        res.locals.body,
      );
      res.json(result);
    },
  );

  router.get("/admin/stats/hotspots", requireAdmin(), validate("query", HotspotQuery), async (_req, res) => {
    const result: HotspotResponse = await hotspots(res.locals.query);
    res.json(result);
  });

  const demoLimit = ipRateLimit({
    windowMinutes: 1,
    limit: 60,
    message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  router.get("/demo/admin/stats/hotspots", demoLimit, validate("query", HotspotQuery), (_req, res) => {
    const result: HotspotResponse = demoHotspots(res.locals.query);
    res.json(result);
  });

  return router;
}
