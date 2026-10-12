import { CONSENT_VERSION } from "@chajeumpyo/shared";
import request from "supertest";
import type { App } from "supertest/types";
import { hashPassword } from "../../src/lib/hash";
import { sentMails } from "../../src/lib/mailer";
import { prisma } from "./db";

/** 마지막으로 받은 인증 메일에서 6자리 코드를 꺼낸다 */
export function lastCodeFor(email: string): string {
  const mail = [...sentMails].reverse().find((m) => m.to === email);
  const code = mail?.text.match(/\d{6}/)?.[0];
  if (!code) throw new Error(`${email}로 보낸 인증 코드가 없어요.`);
  return code;
}

/** 코드 발송 → 확인 → 가입까지 마치고 토큰을 돌려준다 */
export async function signupUser(app: App, email = "student@skuniv.ac.kr", password = "password123") {
  await request(app).post("/api/v1/auth/email/code").send({ email }).expect(204);
  const verify = await request(app)
    .post("/api/v1/auth/email/verify")
    .send({ email, code: lastCodeFor(email) })
    .expect(200);
  const res = await request(app)
    .post("/api/v1/auth/signup")
    .send({ verificationToken: verify.body.verificationToken, password, consent: memberConsent() })
    .expect(201);
  return res.body as { accessToken: string; user: { id: string; email: string; role: string } };
}

export async function createAdmin(email: string, password: string, storagePlaceId: number | null = null) {
  return prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), role: "ADMIN", storagePlaceId },
  });
}

export async function demoLogin(app: App) {
  const res = await request(app).post("/api/v1/auth/demo").send({ consent: demoConsent() }).expect(201);
  return res.body as { accessToken: string; user: { id: string; email: string; role: string } };
}

/** 동의 화면에서 모두 동의한 값 */
export const memberConsent = () => ({ version: CONSENT_VERSION, email: true, externalAi: true, location: true });
export const demoConsent = () => ({ version: CONSENT_VERSION, externalAi: true, location: false });
/** 습득물 등록 multipart 필드용 동의 */
export const finderConsentFields = () => ({
  consentVersion: CONSENT_VERSION,
  consentExternalAi: "true",
  consentLocation: "true",
});
