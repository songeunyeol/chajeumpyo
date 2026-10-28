import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createFrontendRouter } from "../../src/routes/frontend";

// 배포에서 붙는 정적 화면 라우터만 따로 확인한다 (createApp은 production에서만 붙인다)
const app = express();
app.use(createFrontendRouter());
app.use((_req, res) => {
  res.status(404).end();
});

describe("정적 화면", () => {
  it("첫 화면과 찾은 사람 화면을 내려준다", async () => {
    const home = await request(app).get("/");
    expect(home.status).toBe(200);
    expect(home.headers["content-type"]).toContain("text/html");
    expect(home.headers["cache-control"]).toBe("no-cache");
    expect(home.headers["content-security-policy"]).toContain("challenges.cloudflare.com");

    const consent = await request(app).get("/found/consent.html");
    expect(consent.status).toBe(200);
    const api = await request(app).get("/found/api.js");
    expect(api.status).toBe(200);
  });

  it("개발용 파일과 메모는 내려주지 않는다", async () => {
    expect((await request(app).get("/_tester.html")).status).toBe(404);
    expect((await request(app).get("/found/README.md")).status).toBe(404);
    expect((await request(app).get(`/found/${encodeURIComponent("단계.md")}`)).status).toBe(404);
  });
});
