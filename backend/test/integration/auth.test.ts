// F-04 회원가입·로그인, F-05 체험 로그인: 이슈의 완료 기준 10개
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { EnvSchema } from "../../src/config/env";
import { cleanupExpiredDemoAccounts } from "../../src/jobs/demo-cleanup";
import { sentMails } from "../../src/lib/mailer";
import { signSignupToken } from "../../src/lib/tokens";
import { createAdmin, demoLogin, lastCodeFor, memberConsent, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";

let app: ReturnType<typeof createApp>;
const EMAIL = "student@skuniv.ac.kr";
const api = (path: string) => `/api/v1${path}`;
const sendCode = (email: string) => request(app).post(api("/auth/email/code")).send({ email });
const verifyCode = (email: string, code: string) => request(app).post(api("/auth/email/verify")).send({ email, code });
const ageVerification = (minutes: number) =>
  prisma.emailVerification.updateMany({ data: { createdAt: new Date(Date.now() - minutes * 60_000) } });

beforeEach(async () => {
  await resetDb();
  sentMails.length = 0;
  app = createApp(); // 요청 제한 카운터 초기화
});

describe("기준 1. 학교 이메일만 받고, 도메인은 소문자로 바꿔 전체가 정확히 같아야 한다", () => {
  it("다른 도메인은 400 INVALID_EMAIL_DOMAIN", async () => {
    const res = await sendCode("someone@gmail.com");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_EMAIL_DOMAIN");
    expect(sentMails).toHaveLength(0);
  });

  it("비슷한 도메인(서브도메인·접미어)도 거부", async () => {
    expect((await sendCode("a@evil.skuniv.ac.kr")).status).toBe(400);
    expect((await sendCode("a@skuniv.ac.kr.evil.com")).status).toBe(400);
    expect((await sendCode("x@evil-skuniv.ac.kr")).status).toBe(400);
    expect((await sendCode("x@skuniv.ac.kr@evil.com")).status).toBe(400);
    expect(sentMails).toHaveLength(0);
  });

  it("대문자 학교 메일은 통과", async () => {
    await sendCode("STUDENT@SKUNIV.AC.KR").expect(204);
    expect(sentMails[0]?.to).toBe(EMAIL);
  });

  it("대소문자·공백을 정리해서 같은 이메일로 본다", async () => {
    await sendCode("  Student@SKUNIV.ac.kr ").expect(204);
    expect(sentMails[0]?.to).toBe(EMAIL);
  });

  it("이메일 형식이 아니면 400 VALIDATION_ERROR", async () => {
    expect((await sendCode("not-an-email")).body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("기준 2. 코드는 메일로만 가고 DB에는 해시만 남는다", () => {
  it("6자리 코드 메일, DB에 평문 없음", async () => {
    await sendCode(EMAIL).expect(204);
    const code = lastCodeFor(EMAIL);
    expect(code).toMatch(/^\d{6}$/);
    const v = await prisma.emailVerification.findFirstOrThrow({ where: { email: EMAIL } });
    expect(v.codeHash).not.toContain(code);
    expect(v.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("기준 3. 재발송 대기·하루 상한, 가입 여부를 드러내지 않는다", () => {
  it("같은 이메일 1분 안에 다시 요청하면 429", async () => {
    await sendCode(EMAIL).expect(204);
    const res = await sendCode(EMAIL);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("1분이 지나면 다시 받을 수 있다", async () => {
    await sendCode(EMAIL).expect(204);
    await ageVerification(2);
    await sendCode(EMAIL).expect(204);
  });

  it("이미 가입한 이메일도 같은 204, 코드 대신 로그인 안내 메일", async () => {
    await signupUser(app, EMAIL);
    await ageVerification(2);
    sentMails.length = 0;
    const taken = await sendCode(EMAIL);
    const fresh = await sendCode("new@skuniv.ac.kr");
    expect(taken.status).toBe(204);
    expect(taken.body).toEqual(fresh.body);
    const mail = sentMails.find((m) => m.to === EMAIL);
    expect(mail?.subject).toContain("이미 가입");
    expect(mail?.text).not.toMatch(/\d{6}/);
  });

  it("이미 가입한 이메일에도 재발송 대기가 똑같이 걸린다", async () => {
    await signupUser(app, EMAIL);
    expect((await sendCode(EMAIL)).status).toBe(429);
  });

  it("같은 이메일은 하루 10번까지", async () => {
    const createdAt = new Date(Date.now() - 2 * 3600_000);
    await prisma.emailVerification.createMany({
      data: Array.from({ length: 10 }, () => ({ email: EMAIL, codeHash: "x", expiresAt: createdAt, createdAt })),
    });
    const res = await sendCode(EMAIL);
    expect(res.status).toBe(429);
    expect(res.body.error.message).toContain("내일");
    expect(sentMails).toHaveLength(0);
  });

  it("하루 전체 발송 상한(MAIL_DAILY_LIMIT)을 넘으면 429", async () => {
    const createdAt = new Date(Date.now() - 2 * 3600_000);
    await prisma.emailVerification.createMany({
      data: Array.from({ length: 300 }, (_, i) => ({
        email: `u${i}@skuniv.ac.kr`,
        codeHash: "x",
        expiresAt: createdAt,
        createdAt,
      })),
    });
    expect((await sendCode(EMAIL)).status).toBe(429);
    expect(sentMails).toHaveLength(0);
  });

  it("같은 IP는 10분에 10번까지 (다른 이메일이어도)", async () => {
    for (let i = 0; i < 10; i++) await sendCode(`s${i}@skuniv.ac.kr`).expect(204);
    expect((await sendCode("s10@skuniv.ac.kr")).status).toBe(429);
  });
});

describe("기준 4. 틀린 코드와 5회 실패 시 코드 폐기", () => {
  it("틀리면 400 INVALID_CODE, 5번 틀리면 맞는 코드도 거부", async () => {
    await sendCode(EMAIL).expect(204);
    const code = lastCodeFor(EMAIL);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await verifyCode(EMAIL, wrong);
      expect(res.body.error.code).toBe("INVALID_CODE");
    }
    const res = await verifyCode(EMAIL, code);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("다시 받아");
  });

  it("4번 틀려도 5번째에 맞으면 통과", async () => {
    await sendCode(EMAIL).expect(204);
    const code = lastCodeFor(EMAIL);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await verifyCode(EMAIL, wrong);
    await verifyCode(EMAIL, code).expect(200);
  });
});

describe("기준 5. 코드는 5분 유효, 1회용, 이전 코드는 무효", () => {
  it("유효 시간은 5분", async () => {
    await sendCode(EMAIL).expect(204);
    const v = await prisma.emailVerification.findFirstOrThrow({ where: { email: EMAIL } });
    const minutes = (v.expiresAt.getTime() - v.createdAt.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(4.9);
    expect(minutes).toBeLessThan(5.1);
  });

  it("만료되면 거부", async () => {
    await sendCode(EMAIL).expect(204);
    await prisma.emailVerification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await verifyCode(EMAIL, lastCodeFor(EMAIL));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("만료");
  });

  it("새 코드를 받으면 이전 코드는 무효", async () => {
    await sendCode(EMAIL).expect(204);
    const first = lastCodeFor(EMAIL);
    await ageVerification(2);
    await sendCode(EMAIL).expect(204);
    const second = lastCodeFor(EMAIL);
    if (first !== second) expect((await verifyCode(EMAIL, first)).status).toBe(400);
    await verifyCode(EMAIL, second).expect(200);
  });

  it("한 번 확인한 코드는 다시 확인할 수 없다", async () => {
    await sendCode(EMAIL).expect(204);
    const code = lastCodeFor(EMAIL);
    await verifyCode(EMAIL, code).expect(200);
    const again = await verifyCode(EMAIL, code);
    expect(again.status).toBe(400);
    expect(again.body.error.message).toContain("이미 확인");
  });

  it("같은 코드를 동시에 확인해도 토큰은 하나만 나온다", async () => {
    await sendCode(EMAIL).expect(204);
    const code = lastCodeFor(EMAIL);
    const results = await Promise.all(Array.from({ length: 5 }, () => verifyCode(EMAIL, code)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });
});

describe("기준 6. 정상 가입 흐름", () => {
  it("코드 확인 → 가입 → 토큰으로 /me", async () => {
    const { accessToken, user } = await signupUser(app, EMAIL, "password123");
    expect(user).toMatchObject({ email: EMAIL, role: "USER" });
    const me = await request(app).get(api("/me")).set("Authorization", `Bearer ${accessToken}`).expect(200);
    expect(me.body).toEqual({ id: user.id, email: EMAIL, role: "USER" });
  });

  it("비밀번호는 bcrypt 해시로 저장", async () => {
    await signupUser(app, EMAIL, "password123");
    const u = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u.passwordHash).not.toContain("password123");
  });

  it("8자 미만 비밀번호는 400", async () => {
    await sendCode(EMAIL).expect(204);
    const { body } = await verifyCode(EMAIL, lastCodeFor(EMAIL)).expect(200);
    const res = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: body.verificationToken, password: "short", consent: memberConsent() });
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("기준 7. 가입용 토큰은 한 번만, 위조·만료 토큰 거부", () => {
  async function verifiedToken() {
    await sendCode(EMAIL).expect(204);
    return (await verifyCode(EMAIL, lastCodeFor(EMAIL)).expect(200)).body.verificationToken as string;
  }

  it("같은 토큰으로 두 번째 가입은 400 INVALID_CODE", async () => {
    const token = await verifiedToken();
    await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: token, password: "password123", consent: memberConsent() })
      .expect(201);
    const res = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: token, password: "password123", consent: memberConsent() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CODE");
  });

  it("인증 뒤 그사이 같은 이메일로 가입됐어도 이미 쓴 토큰과 같은 응답 (가입 여부를 드러내지 않음)", async () => {
    const used = await verifiedToken();
    await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: used, password: "password123", consent: memberConsent() })
      .expect(201);
    const reused = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: used, password: "password123", consent: memberConsent() });

    await prisma.user.deleteMany();
    await ageVerification(10); // 재발송 대기 넘기기
    const token = await verifiedToken();
    await prisma.user.create({ data: { email: EMAIL, passwordHash: "x", role: "USER" } }); // 다른 요청이 먼저 가입
    const raced = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: token, password: "password123", consent: memberConsent() });
    expect(raced.status).toBe(400);
    expect(raced.body).toEqual(reused.body);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
  });

  it("같은 토큰으로 동시에 가입해도 계정은 하나", async () => {
    const token = await verifiedToken();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(api("/auth/signup"))
          .send({ verificationToken: token, password: "password123", consent: memberConsent() }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
  });

  it("코드를 확인하지 않은 인증 건으로 만든 토큰은 거부", async () => {
    await sendCode(EMAIL).expect(204);
    const v = await prisma.emailVerification.findFirstOrThrow({ where: { email: EMAIL } });
    const { token } = signSignupToken(EMAIL, v.id); // 서버 키로 서명됐지만 verified_at 없음
    const res = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: token, password: "password123", consent: memberConsent() });
    expect(res.body.error.code).toBe("INVALID_CODE");
  });

  it("가입 요청은 같은 IP에서 10분에 10번까지", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(api("/auth/signup"))
        .send({ verificationToken: "x", password: "password123", consent: memberConsent() });
    }
    const res = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: "x", password: "password123", consent: memberConsent() });
    expect(res.status).toBe(429);
  });

  it("엉터리 토큰은 400 INVALID_CODE", async () => {
    const res = await request(app)
      .post(api("/auth/signup"))
      .send({ verificationToken: "abc.def.ghi", password: "password123", consent: memberConsent() });
    expect(res.body.error.code).toBe("INVALID_CODE");
  });
});

describe("기준 8. 로그인과 역할 분리", () => {
  it("맞으면 200, 틀린 비밀번호와 없는 이메일은 같은 401 메시지", async () => {
    await signupUser(app, EMAIL, "password123");
    await request(app).post(api("/auth/login")).send({ email: EMAIL, password: "password123" }).expect(200);
    const wrong = await request(app).post(api("/auth/login")).send({ email: EMAIL, password: "wrongpass1" });
    const none = await request(app).post(api("/auth/login")).send({ email: "x@skuniv.ac.kr", password: "password123" });
    expect(wrong.status).toBe(401);
    expect(none.status).toBe(401);
    expect(wrong.body).toEqual(none.body);
  });

  it("관리자는 관리자 로그인으로만, 소속 보관처를 함께 준다", async () => {
    const b = await prisma.building.create({ data: { name: "A관", lat: 37.6, lng: 127 } });
    const place = await prisma.storagePlace.create({
      data: { name: "A관 경비실", buildingId: b.id, guideText: "-", org: "GUARD" },
    });
    await createAdmin("guard@skuniv.ac.kr", "adminpass1", place.id);

    const res = await request(app)
      .post(api("/admin/auth/login"))
      .send({ email: "guard@skuniv.ac.kr", password: "adminpass1" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ADMIN");
    expect(res.body.storagePlace).toEqual({ id: place.id, name: "A관 경비실" });

    expect(
      (await request(app).post(api("/auth/login")).send({ email: "guard@skuniv.ac.kr", password: "adminpass1" }))
        .status,
    ).toBe(401);
  });

  it("일반 계정은 관리자 로그인 불가", async () => {
    await signupUser(app, EMAIL, "password123");
    expect(
      (await request(app).post(api("/admin/auth/login")).send({ email: EMAIL, password: "password123" })).status,
    ).toBe(401);
  });
});

describe("기준 9. 인증 미들웨어, 민감 정보, 운영 설정", () => {
  it("JWT_SECRET은 32자 이상, ALLOWED_EMAIL_DOMAINS는 기본값 없이 필수", () => {
    const base = { DATABASE_URL: "postgresql://x", JWT_SECRET: "a".repeat(32), ALLOWED_EMAIL_DOMAINS: "skuniv.ac.kr" };
    expect(EnvSchema.safeParse(base).success).toBe(true);
    expect(EnvSchema.safeParse({ ...base, JWT_SECRET: "a".repeat(31) }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base, ALLOWED_EMAIL_DOMAINS: undefined }).success).toBe(false);
  });

  it("production에서는 API 문서를 닫는다", async () => {
    // production 규칙: 사진 링크 주소는 https, 업로드 폴더는 절대 경로
    vi.stubEnv("PUBLIC_BASE_URL", "https://example.test");
    vi.stubEnv("STORAGE_LOCAL_DIR", "/tmp/chajeumpyo-test-uploads");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAPTCHA_MODE", "turnstile"); // production에서는 캡차를 끌 수 없다
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.resetModules();
    try {
      const { createApp: createProdApp } = await import("../../src/app");
      const prod = createProdApp();
      expect((await request(prod).get("/api/docs/")).status).toBe(404);
      expect((await request(prod).get("/api/openapi.json")).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
    expect((await request(app).get("/api/openapi.json")).status).toBe(200);
  });

  it("토큰 없음·엉터리·다른 용도 토큰은 401", async () => {
    expect((await request(app).get(api("/me"))).status).toBe(401);
    expect((await request(app).get(api("/me")).set("Authorization", "Bearer nope")).status).toBe(401);
    await sendCode(EMAIL).expect(204);
    const signupToken = (await verifyCode(EMAIL, lastCodeFor(EMAIL))).body.verificationToken;
    expect((await request(app).get(api("/me")).set("Authorization", `Bearer ${signupToken}`)).status).toBe(401);
  });

  it("관리자 토큰으로 회원 API(/me)는 403", async () => {
    await createAdmin("admin@skuniv.ac.kr", "adminpass1");
    const { body } = await request(app)
      .post(api("/admin/auth/login"))
      .send({ email: "admin@skuniv.ac.kr", password: "adminpass1" });
    expect((await request(app).get(api("/me")).set("Authorization", `Bearer ${body.accessToken}`)).status).toBe(403);
  });

  it("삭제된 계정의 토큰은 401", async () => {
    const { accessToken, user } = await signupUser(app, EMAIL);
    await prisma.user.delete({ where: { id: user.id } });
    expect((await request(app).get(api("/me")).set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
  });

  it("어떤 응답에도 비밀번호 해시가 없다", async () => {
    const signup = await signupUser(app, EMAIL, "password123");
    const login = await request(app).post(api("/auth/login")).send({ email: EMAIL, password: "password123" });
    const me = await request(app).get(api("/me")).set("Authorization", `Bearer ${signup.accessToken}`);
    for (const body of [signup, login.body, me.body])
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
  });
});

describe("기준 10. 체험 로그인", () => {
  it("누를 때마다 다른 체험 계정, /me 동작", async () => {
    const a = await demoLogin(app);
    const b = await demoLogin(app);
    expect(a.user.id).not.toBe(b.user.id);
    expect(a.user.role).toBe("DEMO");
    await request(app).get(api("/me")).set("Authorization", `Bearer ${a.accessToken}`).expect(200);
  });

  it("체험 계정 이메일로는 비밀번호 로그인 불가", async () => {
    const { user } = await demoLogin(app);
    // 저장된 값("!") 그대로 넣어도 bcrypt 형식이 아니라 맞지 않는다
    expect((await request(app).post(api("/auth/login")).send({ email: user.email, password: "!" })).status).toBe(401);
    expect(
      (await request(app).post(api("/auth/login")).send({ email: user.email, password: "anything1" })).status,
    ).toBe(401);
  });

  it("같은 IP에서 10분에 5개까지, 6번째는 429", async () => {
    for (let i = 0; i < 5; i++) await demoLogin(app);
    const res = await request(app).post(api("/auth/demo"));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("24시간이 지나면 토큰이 남아 있어도 401", async () => {
    const { accessToken, user } = await demoLogin(app);
    await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    expect((await request(app).get(api("/me")).set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
  });

  it("정리 배치는 만료된 체험 계정과 그 기록만 지운다", async () => {
    const old = await demoLogin(app);
    const fresh = await demoLogin(app);
    const real = await signupUser(app, EMAIL);
    for (const u of [old, fresh, real]) {
      await prisma.lostReport.create({
        data: {
          userId: u.user.id,
          category: "ETC",
          lostFrom: new Date(),
          lostTo: new Date(),
          description: "x",
          descriptionHash: "h",
        },
      });
    }
    await prisma.user.update({ where: { id: old.user.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });

    expect(await cleanupExpiredDemoAccounts()).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: old.user.id } })).toBeNull();
    expect(await prisma.lostReport.count({ where: { userId: old.user.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: [fresh.user.id, real.user.id] } } })).toBe(2);
    expect(await prisma.lostReport.count()).toBe(2);
  });
});
