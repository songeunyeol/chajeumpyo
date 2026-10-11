import {
  BuildingListResponse,
  NearestBuildingQuery,
  NearestBuildingResponse,
  StoragePlaceListQuery,
  StoragePlaceListResponse,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import { findNearestBuilding, listBuildings, listStoragePlaces } from "../services/buildings";

export const buildingsRouter = Router();

registry.registerPath({
  method: "get",
  path: "/buildings",
  tags: ["건물"],
  summary: "건물 목록 (F-01)",
  responses: {
    200: { description: "건물 목록", content: { "application/json": { schema: BuildingListResponse } } },
  },
});
buildingsRouter.get("/buildings", async (_req, res) => {
  const body: BuildingListResponse = { buildings: await listBuildings() };
  res.json(body);
});

registry.registerPath({
  method: "get",
  path: "/buildings/nearest",
  tags: ["건물"],
  summary: "가장 가까운 건물 (F-01)",
  description: "기준 거리(초안 300m)보다 멀면 building이 null이다.",
  request: { query: NearestBuildingQuery },
  responses: {
    200: { description: "가장 가까운 건물", content: { "application/json": { schema: NearestBuildingResponse } } },
    400: errorResponse("좌표 형식 오류"),
  },
});
buildingsRouter.get("/buildings/nearest", validate("query", NearestBuildingQuery), async (_req, res) => {
  const query: NearestBuildingQuery = res.locals.query;
  const body: NearestBuildingResponse = await findNearestBuilding(query);
  res.json(body);
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
buildingsRouter.get("/storage-places", validate("query", StoragePlaceListQuery), async (_req, res) => {
  const query: StoragePlaceListQuery = res.locals.query;
  const body: StoragePlaceListResponse = { storagePlaces: await listStoragePlaces(query.buildingId) };
  res.json(body);
});
