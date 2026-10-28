// 동의 기록, 캡차, 고가품 보관 제한 (#24, open-issues #32·#35·#38): 이슈의 완료 기준 10개
import { CONSENT_VERSION, type FoundItemExtraction } from "@chajeumpyo/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import { EnvSchema, env } from "../../src/config/env";
import {
  type CaptchaVerifier,
  type CaptchaVerifyResult,
  resetCaptchaVerifier,
  setCaptchaVerifier,
} from "../../src/middlewares/captcha";
import { VALUABLE_IN_PLACE_NOTICE, VALUABLE_PICKUP_NOTICE } from "../../src/services/reveal";
import { demoConsent, finderConsentFields, lastCodeFor, memberConsent, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";
import { noisyJpeg } from "../helpers/images";

let app: ReturnType<typeof createApp>;
let A: number;
const EMAIL = "student@skuniv.ac.kr";

async function verifiedToken(email = EMAIL) {
  await request(app).post("/api/v1/auth/email/code").send({ email }).expect(204);
  const res = await request(app)
    .post("/api/v1/auth/email/verify")
    .send({ email, code: lastCodeFor(email) });
  return res.body.verificationToken as string;
}
const signup = (verificationToken: string, consent: unknown) =>
  request(app).post("/api/v1/auth/signup").send({ verificationToken, password: "password123", consent });

async function register(fields: Record<string, string | number>, headers: Record<string, string> = {}) {
  let req = request(app).post("/api/v1/found-items").set("User-Agent", `ua-${Math.random()}`);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, String(v));
  return req.attach("image", await noisyJpeg(), "p.jpg");
}
/** 그 자리에 둠. 가짜 AI(이어폰)는 귀중품이라 등록이 성공해야 하는 테스트는 extractAs로 귀중품이 아닌 종류를 고른다 (QA B11) */
const base = () => ({ ...finderConsentFields(), buildingId: A, storageType: "IN_PLACE" });

function extractAs(category: FoundItemExtraction["category"]) {
  setAiClient({
    ...mockAiClient,
    extractFoundItem: async (...args) => ({ ...(await mockAiClient.extractFoundItem(...args)), category }),
  });
}

/**
 * 캡차를 켜고 검증 결과를 정한다. 검증 API에 넘어간 값을 모은다.
 * true면 성공으로 보고, 토큰의 ":" 뒤를 action으로 돌려준다(예: "good:demo-login"). hostname은 PUBLIC_BASE_URL의 호스트(테스트는 test.local).
 * 객체를 주면 그대로 돌려준다(hostname·action 불일치 확인용).
 */
function captchaOn(result: boolean | Error | CaptchaVerifyResult) {
  env.CAPTCHA_MODE = "turnstile";
  env.TURNSTILE_SECRET_KEY = "secret-key";
  const calls: Parameters<CaptchaVerifier>[0][] = [];
  setCaptchaVerifier(async (input) => {
    calls.push(input);
    if (result instanceof Error) throw result;
    if (typeof result === "object") return result;
    return { success: result, hostname: new URL(env.PUBLIC_BASE_URL).hostname, action: input.token.split(":")[1] };
  });
  return calls;
}

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
});

const ORIGINAL_BASE_URL = env.PUBLIC_BASE_URL;

afterEach(() => {
  env.CAPTCHA_MODE = "off";
  env.PUBLIC_BASE_URL = ORIGINAL_BASE_URL;
  env.TURNSTILE_HOSTNAMES = undefined;
  env.TURNSTILE_SECRET_KEY = undefined;
  resetCaptchaVerifier();
  resetAiClient();
});

describe("기준 1. 가입은 현재 버전 동의가 있어야 하고, 동의를 저장한다", () => {
  it("동의가 없거나·필수 항목이 빠지거나·옛 버전이면 400", async () => {
    const token = await verifiedToken();
    for (const consent of [
      undefined,
      { ...memberConsent(), email: false },
      { ...memberConsent(), externalAi: false },
      { ...memberConsent(), version: "2026-01-01" },
    ]) {
      const res = await signup(token, consent);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(0);
  });

  it("동의하면 버전·시각·위치 동의 여부를 남긴다", async () => {
    const res = await signup(await verifiedToken(), { ...memberConsent(), location: true });
    expect(res.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(u).toMatchObject({ consentVersion: CONSENT_VERSION, locationConsent: true });
    expect(Date.now() - (u.consentedAt as Date).getTime()).toBeLessThan(10_000);
  });
});

describe("기준 2. 체험 로그인도 동의가 필요하다", () => {
  it("없으면 400, 있으면 저장", async () => {
    expect((await request(app).post("/api/v1/auth/demo").send({})).status).toBe(400);
    const res = await request(app).post("/api/v1/auth/demo").send({ consent: demoConsent() });
    expect(res.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(u.consentVersion).toBe(CONSENT_VERSION);
  });
});

describe("기준 3. 습득물 등록도 동의가 필요하고, 물건에 동의를 남긴다", () => {
  it("외부 AI 처리 미동의·옛 버전은 400, 아무것도 저장하지 않는다", async () => {
    for (const bad of [
      { consentExternalAi: "false" },
      { consentVersion: "2026-01-01" },
      { consentVersion: "", consentExternalAi: "" },
    ]) {
      const res = await register({ ...base(), ...bad });
      expect(res.status).toBe(400);
    }
    expect(await prisma.foundItem.count()).toBe(0);
  });

  it("동의 버전과 위치 동의 여부를 저장", async () => {
    // 저장값이 DB 기본값(false)과 같으면 저장을 빠뜨려도 모르므로 둘 다 확인한다
    extractAs("UMBRELLA");
    for (const location of [true, false]) {
      const res = await register({ ...base(), consentLocation: String(location) });
      expect(res.status).toBe(201);
      const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(item).toMatchObject({ consentVersion: CONSENT_VERSION, locationConsent: location });
    }
  });
});

describe("기준 4. 캡차를 켜면 토큰이 없거나 틀리면 400 CAPTCHA_FAILED", () => {
  it("등록·체험 로그인·인증 코드 요청 모두", async () => {
    captchaOn(false);
    const checks = [
      await register(base()),
      await register(base(), { "X-Captcha-Token": "wrong" }),
      await request(app).post("/api/v1/auth/demo").send({ consent: demoConsent() }),
      await request(app).post("/api/v1/auth/email/code").set("X-Captcha-Token", "wrong").send({ email: EMAIL }),
    ];
    for (const res of checks) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CAPTCHA_FAILED");
    }
    expect(await prisma.foundItem.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.emailVerification.count()).toBe(0);
  });
});

describe("기준 5. 맞는 토큰이면 통과하고, 비밀 키·토큰·IP를 검증에 보낸다", () => {
  it("검증 요청 내용", async () => {
    const calls = captchaOn(true);
    const res = await request(app)
      .post("/api/v1/auth/demo")
      .set("X-Captcha-Token", "good:demo-login")
      .send({ consent: demoConsent() });
    expect(res.status).toBe(201);
    expect(calls).toEqual([{ secret: "secret-key", token: "good:demo-login", ip: expect.any(String) }]);
    extractAs("UMBRELLA");
    expect((await register(base(), { "X-Captcha-Token": "good:found-analyze" })).status).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/email/code")
          .set("X-Captcha-Token", "good:email-code")
          .send({ email: EMAIL })
      ).status,
    ).toBe(204);
  });
});

describe("기준 5-1. 다른 화면(action)에서 받은 토큰은 막는다", () => {
  it("action이 다르거나 없으면 400 CAPTCHA_FAILED", async () => {
    captchaOn(true);
    const checks = [
      // 사진 화면 토큰으로 체험 계정 만들기
      await request(app)
        .post("/api/v1/auth/demo")
        .set("X-Captcha-Token", "good:found-analyze")
        .send({ consent: demoConsent() }),
      // 체험 로그인 토큰으로 습득물 등록
      await register(base(), { "X-Captcha-Token": "good:demo-login" }),
      // action 없음
      await request(app).post("/api/v1/auth/email/code").set("X-Captcha-Token", "good").send({ email: EMAIL }),
    ];
    for (const res of checks) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CAPTCHA_FAILED");
    }
    expect(await prisma.foundItem.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.emailVerification.count()).toBe(0);
  });
});

describe("기준 5-1b. Cloudflare 테스트 키 결과(action 없음)", () => {
  const demo = () =>
    request(app).post("/api/v1/auth/demo").set("X-Captcha-Token", "t").send({ consent: demoConsent() });

  it("production이 아니면 action 확인을 건너뛰어 로컬에서 흐름을 확인할 수 있다", async () => {
    captchaOn({ success: true, hostname: "test.local", testingKey: true });
    expect((await demo()).status).toBe(201);
  });

  it("production에서는 테스트 키 결과라도 action이 없으면 막는다", async () => {
    const original = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      captchaOn({ success: true, hostname: "test.local", testingKey: true });
      const res = await demo();
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CAPTCHA_FAILED");
    } finally {
      env.NODE_ENV = original;
    }
  });
});

describe("기준 5-2. 우리 사이트가 아닌 곳에서 받은 토큰은 막는다", () => {
  it("hostname이 PUBLIC_BASE_URL과 다르면 400, 같으면 통과", async () => {
    env.PUBLIC_BASE_URL = "https://chajeumpyo.example.com";
    const demo = (token: string) =>
      request(app).post("/api/v1/auth/demo").set("X-Captcha-Token", token).send({ consent: demoConsent() });

    captchaOn({ success: true, hostname: "evil.example.net", action: "demo-login" });
    const bad = await demo("t");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("CAPTCHA_FAILED");

    captchaOn({ success: true, action: "demo-login" }); // hostname 없음
    expect((await demo("t")).status).toBe(400);

    captchaOn({ success: true, hostname: "chajeumpyo.example.com", action: "demo-login" });
    expect((await demo("t")).status).toBe(201);
  });

  it("TURNSTILE_HOSTNAMES가 있으면 그 목록으로 확인한다", async () => {
    env.TURNSTILE_HOSTNAMES = "app.example.com, www.example.com";
    captchaOn({ success: true, hostname: "localhost", action: "demo-login" });
    const res = await request(app)
      .post("/api/v1/auth/demo")
      .set("X-Captcha-Token", "t")
      .send({ consent: demoConsent() });
    expect(res.body.error?.code).toBe("CAPTCHA_FAILED");
    captchaOn({ success: true, hostname: "www.example.com", action: "demo-login" });
    expect(
      (await request(app).post("/api/v1/auth/demo").set("X-Captcha-Token", "t").send({ consent: demoConsent() }))
        .status,
    ).toBe(201);
  });

  it("success가 false면 hostname·action이 맞아도 막는다", async () => {
    captchaOn({ success: false, hostname: "test.local", action: "demo-login" });
    const res = await request(app)
      .post("/api/v1/auth/demo")
      .set("X-Captcha-Token", "t")
      .send({ consent: demoConsent() });
    expect(res.body.error.code).toBe("CAPTCHA_FAILED");
  });
});

describe("기준 6. 캡차 검증 서버 오류면 통과시키지 않는다", () => {
  it("오류·시간 초과는 400", async () => {
    captchaOn(new Error("timeout"));
    const res = await request(app)
      .post("/api/v1/auth/demo")
      .set("X-Captcha-Token", "good-token")
      .send({ consent: demoConsent() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CAPTCHA_FAILED");
  });
});

describe("기준 7. 캡차 끄기는 개발에서만", () => {
  it("꺼져 있으면 토큰 없이 동작, production에서 끄거나 비밀 키 없이 켜면 설정 오류", async () => {
    expect((await request(app).post("/api/v1/auth/demo").send({ consent: demoConsent() })).status).toBe(201);
    // PUBLIC_BASE_URL·STORAGE_LOCAL_DIR는 production 규칙(https·절대 경로)을 맞춘 값 (규칙 자체는 unit/env.test.ts)
    const ok = {
      DATABASE_URL: "postgresql://x",
      JWT_SECRET: "a".repeat(32),
      ALLOWED_EMAIL_DOMAINS: "skuniv.ac.kr",
      PUBLIC_BASE_URL: "https://example.test",
      STORAGE_LOCAL_DIR: "/data/uploads",
    };
    expect(EnvSchema.safeParse({ ...ok, NODE_ENV: "production" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...ok, CAPTCHA_MODE: "turnstile" }).success).toBe(false);
    const prod = { ...ok, NODE_ENV: "production", CAPTCHA_MODE: "turnstile", TURNSTILE_SECRET_KEY: "k" };
    // 사이트 키가 없으면 프론트가 위젯을 못 그리므로 설정 오류
    expect(EnvSchema.safeParse(prod).success).toBe(false);
    expect(EnvSchema.safeParse({ ...prod, TURNSTILE_SITE_KEY: "site" }).success).toBe(true);
  });
});

describe("기준 8. 고가품을 그 자리에 두면 등록하지 않고 보관처에 맡겨 달라고 한다 (QA B11)", () => {
  it("400 VALUABLE_HAND_OVER_REQUIRED, 아무것도 저장하지 않는다", async () => {
    extractAs("WALLET");
    const res = await register(base());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "VALUABLE_HAND_OVER_REQUIRED",
      message: "귀중품은 보관처(교무처)에 맡겨 주세요.",
    });
    expect(await prisma.foundItem.count()).toBe(0);
    expect(JSON.stringify(res.body)).not.toMatch(/WHITE|Apple|곰돌이/);
  });
});

describe("기준 9. 고가품이 아니거나, 맡겼거나, AI가 실패하면 그 자리에 둠도 등록 (안내 필드는 늘 null)", () => {
  it("세 경우 모두 201, handOverAdvice는 null", async () => {
    const place = await createStoragePlace("혜인관 경비실", A);
    extractAs("UMBRELLA");
    const umbrella = await register(base());
    expect([umbrella.status, umbrella.body.handOverAdvice]).toEqual([201, null]);
    extractAs("WALLET");
    const wallet = await register({ ...base(), storageType: "HANDED_OVER", storagePlaceId: place.id });
    expect([wallet.status, wallet.body.handOverAdvice]).toEqual([201, null]);
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async () => {
        throw new Error("AI 장애");
      },
    });
    const review = await register(base());
    expect(review.body.status).toBe("REVIEW");
    expect(review.body.handOverAdvice).toBeNull();
  });
});

describe("기준 10. 공개 화면은 고가품이면 대면 수령 안내", () => {
  it("보관처에 맡긴 지갑은 대면 안내, 그 자리에 둔 지갑은 그 자리 안내, 우산은 null", async () => {
    const user = await signupUser(app);
    const place = await createStoragePlace("혜인관 경비실", A);
    const notices: (string | null)[] = [];
    const cases = [
      { category: "WALLET", storageType: "HANDED_OVER", storagePlaceId: place.id },
      { category: "WALLET", storageType: "IN_PLACE", storagePlaceId: null },
      { category: "UMBRELLA", storageType: "HANDED_OVER", storagePlaceId: place.id },
    ] as const;
    for (const c of cases) {
      const item = await createFoundItem({ buildingId: A, foundAt: hoursAgo(1), ...c });
      await prisma.foundItemDetail.update({
        where: { foundItemId: item.id },
        data: { imagePublicKey: `found/${item.id}/public.jpg` },
      });
      await createAttempt(user.user.id, item.id, { result: "PASS" });
      const res = await request(app)
        .get(`/api/v1/found-items/${item.id}/detail`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);
      notices.push(res.body.pickupNotice);
    }
    expect(notices[0]).toBe(VALUABLE_PICKUP_NOTICE);
    // 직원이 맡고 있지 않으니 "직원이 한 번 더 확인"을 약속하지 않는다
    expect(notices[1]).toBe(VALUABLE_IN_PLACE_NOTICE);
    expect(notices[1]).not.toContain("직원");
    expect(notices[2]).toBeNull();
  });
});
