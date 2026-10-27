import { NotificationIdParams, NotificationListResponse } from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as inbox from "../services/notification-inbox";

const security = [{ bearerAuth: [] }];
const tags = ["알림"];

registry.registerPath({
  method: "get",
  path: "/notifications",
  tags,
  security,
  summary: "내 알림 (F-13)",
  description: "최신순 최대 50개. 분실자·체험 계정·관리자 모두 자기 알림만 본다.",
  responses: {
    200: { description: "알림", content: { "application/json": { schema: NotificationListResponse } } },
    401: errorResponse("UNAUTHORIZED"),
  },
});
registry.registerPath({
  method: "patch",
  path: "/notifications/{id}/read",
  tags,
  security,
  summary: "알림 읽음",
  request: { params: NotificationIdParams },
  responses: { 204: { description: "읽음" }, 404: errorResponse("NOT_FOUND: 없거나 남의 알림") },
});
registry.registerPath({
  method: "patch",
  path: "/notifications/read-all",
  tags,
  security,
  summary: "알림 모두 읽음",
  responses: { 204: { description: "모두 읽음" } },
});

export function createNotificationsRouter() {
  const router = Router();
  const anyone = requireAuth("USER", "DEMO", "ADMIN");

  router.get("/notifications", anyone, async (_req, res) => {
    const result: NotificationListResponse = await inbox.listNotifications(getAuth(res).userId);
    res.json(result);
  });

  // read-all이 :id보다 먼저 와야 한다
  router.patch("/notifications/read-all", anyone, async (_req, res) => {
    await inbox.markAllRead(getAuth(res).userId);
    res.status(204).end();
  });

  router.patch("/notifications/:id/read", anyone, validate("params", NotificationIdParams), async (_req, res) => {
    await inbox.markRead(getAuth(res).userId, res.locals.params.id);
    res.status(204).end();
  });

  return router;
}
