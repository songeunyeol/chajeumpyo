import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env";

/** 인증 코드·QR 토큰처럼 짧은 비밀값 저장용. 서버 비밀키로 HMAC해서 DB가 새도 역산하기 어렵게 한다. */
export function hmac(value: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(value).digest("hex");
}

export function hmacEquals(value: string, expectedHex: string): boolean {
  const a = Buffer.from(hmac(value), "hex");
  const b = Buffer.from(expectedHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** 로그인할 수 없는 계정(체험 계정)의 password_hash. bcrypt 형식이 아니라 어떤 비밀번호와도 맞지 않는다. */
export const UNUSABLE_PASSWORD = "!";
