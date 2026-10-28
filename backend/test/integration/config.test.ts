// GET /config: 프론트가 캡차 위젯을 그릴지, 어떤 사이트 키로 그릴지 정한다
import { PublicConfigResponse } from "@chajeumpyo/shared";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";

afterEach(() => {
  env.CAPTCHA_MODE = "off";
  env.TURNSTILE_SECRET_KEY = undefined;
  env.TURNSTILE_SITE_KEY = undefined;
});

describe("GET /config", () => {
  it("캡차가 꺼져 있으면 off, 사이트 키 없음", async () => {
    const res = await request(createApp()).get("/api/v1/config");
    expect(res.status).toBe(200);
    expect(PublicConfigResponse.parse(res.body)).toEqual({ captcha: { mode: "off", siteKey: null } });
  });

  it("turnstile이면 사이트 키만 내려 주고 비밀 키는 어디에도 없다", async () => {
    env.CAPTCHA_MODE = "turnstile";
    env.TURNSTILE_SECRET_KEY = "secret-should-not-leak";
    env.TURNSTILE_SITE_KEY = "0x4AAAAAAA-site";
    const res = await request(createApp()).get("/api/v1/config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ captcha: { mode: "turnstile", siteKey: "0x4AAAAAAA-site" } });
    expect(res.text).not.toContain("secret-should-not-leak");
  });

  it("off인데 사이트 키가 남아 있어도 내려 주지 않는다 (위젯을 그리지 않게)", async () => {
    env.TURNSTILE_SITE_KEY = "0x4AAAAAAA-site";
    const res = await request(createApp()).get("/api/v1/config");
    expect(res.body.captcha).toEqual({ mode: "off", siteKey: null });
  });

  it("OpenAPI 문서에 등록돼 있다", async () => {
    const res = await request(createApp()).get("/api/openapi.json");
    expect(res.body.paths["/config"]?.get).toBeDefined();
  });
});
