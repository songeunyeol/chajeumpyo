import { BuildingListResponse, StoragePlaceListQuery, StoragePlaceListResponse } from "@chajeumpyo/shared";
import { Router } from "express";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import { listBuildings, listStoragePlaces } from "../services/buildings";

registry.registerPath({
  method: "get",
  path: "/buildings",
  tags: ["건물"],
  summary: "건물 목록 (F-01)",
  description:
    "건물 중심 좌표를 함께 준다. 가장 가까운 건물은 프론트가 브라우저 안에서 고르고(packages/shared nearestBuilding), 사용자 좌표는 서버로 보내지 않는다.",
  responses: {
    200: { description: "건물 목록", content: { "application/json": { schema: BuildingListResponse } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/storage-places",
  tags: ["건물"],
  summary: "보관처 목록 (F-01)",
  description: "buildingId를 주면 그 건물의 보관처가 앞에 온다(sameBuilding: true).",
  request: { query: StoragePlaceListQuery },
  responses: {
    200: { description: "보관처 목록", content: { "application/json": { schema: StoragePlaceListResponse } } },
    400: errorResponse("입력 형식 오류"),
  },
});

export function createBuildingsRouter() {
  const router = Router();

  router.get("/buildings", async (_req, res) => {
    const body: BuildingListResponse = { buildings: await listBuildings() };
    res.json(body);
  });

  router.get("/storage-places", validate("query", StoragePlaceListQuery), async (_req, res) => {
    const query: StoragePlaceListQuery = res.locals.query;
    const body: StoragePlaceListResponse = { storagePlaces: await listStoragePlaces(query.buildingId) };
    res.json(body);
  });

  return router;
}
