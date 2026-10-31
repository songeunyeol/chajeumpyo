import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

    const consent = await request(app).get("/found/consent");
    expect(consent.status).toBe(200);
    expect(consent.headers["content-type"]).toContain("text/html");
    const api = await request(app).get("/found/api.js");
    expect(api.status).toBe(200);
  });

  it("옛 .html 주소는 쿼리를 그대로 붙여 .html 없는 주소로 넘긴다", async () => {
    const page = await request(app).get("/lost/item.html?id=abc&qr=1");
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe("/lost/item?id=abc&qr=1");
    expect((await request(app).get("/index.html")).headers.location).toBe("/");
    expect((await request(app).get("/found/consent.html")).headers.location).toBe("/found/consent");
    expect((await request(app).get("/lost/item?id=abc")).status).toBe(200);
  });

  it(".html 주소를 넘길 때 다른 사이트 주소를 만들지 않는다", async () => {
    for (const path of ["//evil.example/x.html", "/\\evil.example/x.html", "///evil.example/index.html"]) {
      const res = await request(app).get(path);
      if (res.status === 302) expect(res.headers.location).toMatch(/^\/(?![/\\])/);
    }
  });

  it("개발용 파일과 메모는 내려주지 않는다", async () => {
    expect((await request(app).get("/_tester.html")).status).toBe(404);
    expect((await request(app).get("/found/README.md")).status).toBe(404);
    expect((await request(app).get(`/found/${encodeURIComponent("단계.md")}`)).status).toBe(404);
  });

  it("디자인 확인 화면(팔레트·한눈에)은 내려주지 않는다", async () => {
    expect((await request(app).get(`/${encodeURIComponent("팔레트.html")}`)).status).toBe(404);
    expect((await request(app).get(`/${encodeURIComponent("한눈에.html")}`)).status).toBe(404);
    // macOS에서 온 NFD 이름도 같은 파일로 본다
    expect((await request(app).get(`/${encodeURIComponent("한눈에.html".normalize("NFD"))}`)).status).toBe(404);
    expect((await request(app).get("/palette.css")).status).toBe(200);
  });
});

describe("인라인 이벤트 속성", () => {
  // helmet 기본값 script-src-attr 'none' 때문에 onclick 같은 속성은 배포에서 동작하지 않는다
  it("배포되는 화면에 onclick 같은 인라인 이벤트 속성이 없다", () => {
    const root = resolve(import.meta.dirname, "../../../frontend");
    const htmls = (readdirSync(root, { recursive: true }) as string[]).filter(
      (f) => f.endsWith(".html") && !f.split("/").some((part) => part.startsWith("_")),
    );
    expect(htmls).toContain("offline.html");
    const offenders = htmls.filter((f) => /\son[a-z]+\s*=/i.test(readFileSync(join(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
