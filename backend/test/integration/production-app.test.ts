import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { prisma, resetDb } from "../helpers/db";

// 배포와 같은 production 모드로 createApp을 띄워 API·정적 화면 순서와 CSP를 확인한다.
// 정적 폴더에 /health, /api/v1/buildings와 같은 이름의 파일을 일부러 둬서 API가 먼저 처리되는지 본다.
let app: ReturnType<typeof createApp>;
let dir: string;
const before = { NODE_ENV: env.NODE_ENV, FRONTEND_DIR: env.FRONTEND_DIR };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "chajeumpyo-front-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>정적 첫 화면</title>");
  writeFileSync(join(dir, "health"), "STATIC-HEALTH");
  mkdirSync(join(dir, "api/v1"), { recursive: true });
  writeFileSync(join(dir, "api/v1/buildings"), "STATIC-BUILDINGS");
  writeFileSync(join(dir, "팔레트.html"), "<!doctype html>");
  env.NODE_ENV = "production";
  env.FRONTEND_DIR = dir;
  app = createApp();
});

afterAll(() => {
  env.NODE_ENV = before.NODE_ENV;
  env.FRONTEND_DIR = before.FRONTEND_DIR;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDb();
  await prisma.building.create({ data: { name: "A관", lat: 37.6, lng: 127.0, sortOrder: 1 } });
});

describe("production 앱 (API + 정적 화면 한 주소)", () => {
  it("/health와 /api/v1은 같은 이름의 정적 파일보다 먼저 처리된다", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });

    const buildings = await request(app).get("/api/v1/buildings");
    expect(buildings.status).toBe(200);
    expect(buildings.headers["content-type"]).toContain("application/json");
    expect(buildings.body.buildings.map((b: { name: string }) => b.name)).toEqual(["A관"]);
  });

  it("없는 API 경로는 JSON 404, 없는 화면 경로도 404", async () => {
    const api = await request(app).get("/api/v1/no-such-route");
    expect(api.status).toBe(404);
    expect(api.headers["content-type"]).toContain("application/json");
    expect(api.body.error.code).toBe("NOT_FOUND");

    const page = await request(app).get("/no-such-page.html");
    expect(page.status).toBe(404);
    expect(page.text).not.toContain("<!doctype html>");
  });

  it("정적 화면은 CSP에 글꼴 CDN·Turnstile을 열고, 디자인 확인 화면은 내려주지 않는다", async () => {
    const home = await request(app).get("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain("정적 첫 화면");
    const csp = home.headers["content-security-policy"];
    expect(csp).toContain("cdn.jsdelivr.net");
    expect(csp).toContain("challenges.cloudflare.com");
    // 수령 QR 라이브러리와 지도 대체 위성 타일 (QA 10/29: QR이 안 그려지고 지도가 회색으로만 보이던 원인)
    expect(csp).toMatch(/script-src[^;]*https:\/\/cdnjs\.cloudflare\.com/);
    expect(csp).toMatch(/img-src[^;]*https:\/\/server\.arcgisonline\.com/);

    expect((await request(app).get(`/${encodeURIComponent("팔레트.html")}`)).status).toBe(404);
  });
});
