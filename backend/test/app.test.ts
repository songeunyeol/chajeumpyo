import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    building: {
      findMany: vi.fn(async () => [{ id: 1, name: "A관", lat: 37.6, lng: 127.0 }]),
    },
  },
}));

const { createApp } = await import("../src/app");
const app = createApp();

describe("app", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /api/v1/buildings/nearest", async () => {
    const res = await request(app).get("/api/v1/buildings/nearest?lat=37.6001&lng=127.0");
    expect(res.status).toBe(200);
    expect(res.body.building).toEqual({ id: 1, name: "A관" });
  });

  it("검증 실패는 명세의 에러 형식으로 응답한다", async () => {
    const res = await request(app).get("/api/v1/buildings/nearest?lat=abc&lng=127");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].path).toBe("lat");
  });

  it("없는 경로는 404 NOT_FOUND", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("OpenAPI 문서에 등록한 경로가 들어 있다", async () => {
    const res = await request(app).get("/api/openapi.json");
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(["/buildings", "/buildings/nearest", "/storage-places"]),
    );
  });
});
