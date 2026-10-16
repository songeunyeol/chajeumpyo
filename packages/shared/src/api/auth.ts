import { z } from "zod";
import { Role } from "../enums";

/** 앞뒤 공백 제거 + 소문자 */
const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "이메일 형식이 올바르지 않아요." }));

/** bcrypt는 72바이트까지만 쓰므로 길이를 제한한다. (초안: 8자 이상) */
export const Password = z.string().min(8, "비밀번호는 8자 이상이어야 해요.").max(64, "비밀번호는 64자 이하여야 해요.");

export const AuthUser = z.object({
  id: z.string(),
  email: z.string(),
  role: Role,
});
export type AuthUser = z.infer<typeof AuthUser>;

/** POST /auth/email/code */
export const EmailCodeRequest = z.object({ email: Email });
export type EmailCodeRequest = z.infer<typeof EmailCodeRequest>;

/** POST /auth/email/verify */
export const EmailVerifyRequest = z.object({
  email: Email,
  code: z.string().regex(/^\d{6}$/, "인증 코드는 숫자 6자리예요."),
});
export type EmailVerifyRequest = z.infer<typeof EmailVerifyRequest>;

export const EmailVerifyResponse = z.object({
  /** 10분 만료, 가입 1회용 */
  verificationToken: z.string(),
  expiresAt: z.iso.datetime(),
});
export type EmailVerifyResponse = z.infer<typeof EmailVerifyResponse>;

/** POST /auth/signup */
export const SignupRequest = z.object({
  verificationToken: z.string().min(1),
  password: Password,
});
export type SignupRequest = z.infer<typeof SignupRequest>;

/** POST /auth/login, POST /admin/auth/login */
export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** 회원가입·로그인 응답 */
export const AuthResponse = z.object({
  accessToken: z.string(),
  /** 토큰 만료 시각 */
  expiresAt: z.iso.datetime(),
  user: AuthUser,
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** 관리자 로그인 응답: 소속 보관처를 함께 준다 */
export const AdminAuthResponse = AuthResponse.extend({
  storagePlace: z.object({ id: z.number().int(), name: z.string() }).nullable(),
});
export type AdminAuthResponse = z.infer<typeof AdminAuthResponse>;

/** GET /me */
export const MeResponse = AuthUser;
export type MeResponse = z.infer<typeof MeResponse>;
