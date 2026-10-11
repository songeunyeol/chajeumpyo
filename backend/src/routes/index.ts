import { Router } from "express";
import { createAuthRouter } from "./auth";
import { createBuildingsRouter } from "./buildings";
import { createClaimsRouter } from "./claims";
import { createFoundItemsRouter } from "./found-items";
import { createLostReportsRouter } from "./lost-reports";

/** /api/v1 아래 라우터. 기능별 라우터를 여기에 붙인다. 요청 제한 카운터가 앱마다 따로 생기도록 팩토리로 만든다. */
export function createApiRouter() {
  const router = Router();
  router.use(createAuthRouter());
  router.use(createBuildingsRouter());
  router.use(createFoundItemsRouter());
  router.use(createLostReportsRouter());
  router.use(createClaimsRouter());
  return router;
}
