import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma, resetDb } from "../helpers/db";

const app = createApp();

beforeEach(async () => {
  await resetDb();
  const a = await prisma.building.create({ data: { name: "A관", lat: 37.6, lng: 127.0, sortOrder: 1 } });
  const b = await prisma.building.create({ data: { name: "B관", lat: 37.601, lng: 127.0, sortOrder: 2 } });
  await prisma.storagePlace.createMany({
    data: [
      { name: "종합서비스센터", buildingId: a.id, guideText: "A관 1층", org: "CENTER" },
      { name: "B관 경비실", buildingId: b.id, guideText: "B관 정문", org: "GUARD" },
      { name: "닫힌 보관처", buildingId: b.id, guideText: "-", org: "GUARD", isActive: false },
    ],
  });
});

describe("건물·보관처", () => {
  it("GET /health", async () => {
    expect((await request(app).get("/health")).body).toEqual({ ok: true });
  });

  it("건물 목록은 표시 순서대로, 건물 중심 좌표 포함", async () => {
    const res = await request(app).get("/api/v1/buildings");
    expect(res.body.buildings.map((b: { name: string }) => b.name)).toEqual(["A관", "B관"]);
    expect(res.body.buildings[0]).toEqual({
      id: expect.any(Number),
      name: "A관",
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
  });

  it("쿼리 검증 실패는 명세의 에러 형식", async () => {
    const res = await request(app).get("/api/v1/storage-places?buildingId=abc");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].path).toBe("buildingId");
  });

  it("보관처: 비활성 제외, 같은 건물 먼저", async () => {
    const b = await prisma.building.findUniqueOrThrow({ where: { name: "B관" } });
    const res = await request(app).get(`/api/v1/storage-places?buildingId=${b.id}`);
    expect(res.body.storagePlaces.map((p: { name: string }) => p.name)).toEqual(["B관 경비실", "종합서비스센터"]);
    expect(res.body.storagePlaces[0].sameBuilding).toBe(true);
  });

  it("없는 경로는 404 NOT_FOUND", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
