import {
  FoundItemIdParams,
  PickupCompleteResponse,
  PickupIdParams,
  PickupQrResponse,
  PickupScanRequest,
  PickupScanResponse,
  SelfPickupResponse,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireAdmin, requireMember } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as service from "../services/pickups";

const json = <T>(schema: T) => ({ content: { "application/json": { schema } } });
const security = [{ bearerAuth: [] }];

registry.registerPath({
  method: "post",
  path: "/found-items/{id}/pickup-qr",
  tags: ["수령"],
  security,
  summary: "수령 QR 발급 (F-11)",
  description:
    "통과한 계정 + 보관처에 맡긴 물건만. 24시간 유효, 다시 받으면 이전 QR은 만료. 체험 계정은 QR 없이 바로 완료(method=DEMO).",
  request: { params: FoundItemIdParams },
  responses: {
    200: { description: "QR 또는 체험 완료", ...json(PickupQrResponse) },
    403: errorResponse("FORBIDDEN: 통과하지 않음"),
    404: errorResponse("NOT_FOUND"),
    409: errorResponse("INVALID_STORAGE_TYPE, ALREADY_CLAIMED"),
  },
});
registry.registerPath({
  method: "post",
  path: "/found-items/{id}/self-pickup",
  tags: ["수령"],
  security,
  summary: "그 자리에 둔 물건 찾았어요 (F-11)",
  request: { params: FoundItemIdParams },
  responses: {
    200: { description: "수령 완료", ...json(SelfPickupResponse) },
    403: errorResponse("FORBIDDEN: 통과하지 않음"),
    409: errorResponse("INVALID_STORAGE_TYPE, ALREADY_CLAIMED"),
  },
});
registry.registerPath({
  method: "post",
  path: "/admin/pickups/scan",
  tags: ["관리자"],
  security,
  summary: "수령 QR 스캔 (F-11, F-14)",
  description: "자기 보관처 물건만. 원본 사진 링크와 마스킹된 이메일을 준다.",
  request: { body: json(PickupScanRequest) },
  responses: {
    200: { description: "수령 건", ...json(PickupScanResponse) },
    403: errorResponse("FORBIDDEN: 다른 보관처"),
    404: errorResponse("NOT_FOUND: 없는 QR"),
    409: errorResponse("ALREADY_CLAIMED"),
    410: errorResponse("QR_EXPIRED"),
  },
});
registry.registerPath({
  method: "post",
  path: "/admin/pickups/{id}/complete",
  tags: ["관리자"],
  security,
  summary: "수령 완료 처리 (F-11, F-14)",
  description: "먼저 완료된 수령만 인정한다. 물건은 CLAIMED, 신고는 RESOLVED, 다른 사람의 QR은 만료.",
  request: { params: PickupIdParams },
  responses: {
    200: { description: "완료", ...json(PickupCompleteResponse) },
    403: errorResponse("FORBIDDEN: 다른 보관처"),
    404: errorResponse("NOT_FOUND"),
    409: errorResponse("ALREADY_CLAIMED"),
    410: errorResponse("QR_EXPIRED"),
  },
});

export function createPickupsRouter() {
  const router = Router();
  const viewer = (res: Parameters<typeof getAuth>[0]) => {
    const a = getAuth(res);
    return { userId: a.userId, role: a.role };
  };
  const admin = (res: Parameters<typeof getAuth>[0]) => {
    const a = getAuth(res);
    return { userId: a.userId, storagePlaceId: a.storagePlaceId };
  };

  router.post(
    "/found-items/:id/pickup-qr",
    requireMember(),
    validate("params", FoundItemIdParams),
    async (_req, res) => {
      const result: PickupQrResponse = await service.issuePickupQr(viewer(res), res.locals.params.id);
      res.json(result);
    },
  );

  router.post(
    "/found-items/:id/self-pickup",
    requireMember(),
    validate("params", FoundItemIdParams),
    async (_req, res) => {
      const result: SelfPickupResponse = await service.selfPickup(viewer(res), res.locals.params.id);
      res.json(result);
    },
  );

  router.post("/admin/pickups/scan", requireAdmin(), validate("body", PickupScanRequest), async (_req, res) => {
    const result: PickupScanResponse = await service.scanPickup(admin(res), res.locals.body.qrToken);
    res.json(result);
  });

  router.post("/admin/pickups/:id/complete", requireAdmin(), validate("params", PickupIdParams), async (_req, res) => {
    const result: PickupCompleteResponse = await service.completePickup(admin(res), res.locals.params.id);
    res.json(result);
  });

  return router;
}
