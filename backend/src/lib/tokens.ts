import type { Role } from "@chajeumpyo/shared";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./errors";

// 서명 키는 하나(JWT_SECRET)를 쓰고, 용도는 typ으로 구분해 다른 용도의 토큰을 받아들이지 않는다.

type AccessPayload = { typ: "access"; sub: string; role: Role };
type SignupPayload = { typ: "signup"; email: string; verificationId: string };

const ALGORITHM = "HS256" as const;

function sign(payload: AccessPayload | SignupPayload, ttlSeconds: number) {
  const token = jwt.sign(payload, env.JWT_SECRET, { algorithm: ALGORITHM, expiresIn: ttlSeconds });
  return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
}

function verify(token: string): Record<string, unknown> | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
    return typeof decoded === "object" ? decoded : null;
  } catch {
    return null;
  }
}

export function signAccessToken(userId: string, role: Role, ttlHours: number) {
  return sign({ typ: "access", sub: userId, role }, Math.round(ttlHours * 3600));
}

export function verifyAccessToken(token: string): AccessPayload {
  const p = verify(token);
  if (p?.typ !== "access" || typeof p.sub !== "string") {
    throw new AppError("UNAUTHORIZED", "로그인이 필요해요.");
  }
  return p as AccessPayload;
}

/** 가입용 토큰 (기능 명세서 F-04, open-issues #4): 10분 만료, email_verification.consumed_at으로 1회만 사용 */
export const SIGNUP_TOKEN_TTL_SECONDS = 10 * 60;

export function signSignupToken(email: string, verificationId: string) {
  return sign({ typ: "signup", email, verificationId }, SIGNUP_TOKEN_TTL_SECONDS);
}

export function verifySignupToken(token: string): SignupPayload {
  const p = verify(token);
  if (p?.typ !== "signup" || typeof p.email !== "string" || typeof p.verificationId !== "string") {
    throw new AppError("INVALID_CODE", "인증이 만료됐어요. 이메일 인증을 다시 해주세요.");
  }
  return p as SignupPayload;
}
