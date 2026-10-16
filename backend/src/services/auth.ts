import { randomInt, randomUUID } from "node:crypto";
import type { AdminAuthResponse, AuthResponse, AuthUser, Role } from "@chajeumpyo/shared";
import { allowedEmailDomains, env } from "../config/env";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "../lib/errors";
import { hashPassword, hmac, hmacEquals, UNUSABLE_PASSWORD, verifyPassword } from "../lib/hash";
import { sendMail } from "../lib/mailer";
import { prisma } from "../lib/prisma";
import { signAccessToken, signSignupToken, verifySignupToken } from "../lib/tokens";

/** 인증 코드 유효 시간 (QA B4) */
export const CODE_TTL_MINUTES = 5;
/** 이 횟수만큼 틀리면 코드를 버린다. 다시 받아야 한다 */
export const CODE_MAX_FAILS = 5;
/** 같은 이메일로 다시 보내려면 기다려야 하는 시간 */
export const CODE_RESEND_COOLDOWN_SECONDS = 60;
/** 같은 이메일로 하루에 보낼 수 있는 인증 메일 수 */
export const CODE_DAILY_LIMIT_PER_EMAIL = 10;

const DAY_MS = 24 * 60 * 60_000;

function toAuthUser(user: { id: string; email: string; role: AuthUser["role"] }): AuthUser {
  return { id: user.id, email: user.email, role: user.role };
}

function issueAuth(user: { id: string; email: string; role: AuthUser["role"] }): AuthResponse {
  const ttlHours = user.role === "DEMO" ? env.DEMO_TTL_HOURS : env.ACCESS_TOKEN_TTL_HOURS;
  const { token, expiresAt } = signAccessToken(user.id, user.role, ttlHours);
  return { accessToken: token, expiresAt: expiresAt.toISOString(), user: toAuthUser(user) };
}

/** 소문자로 바꾼 뒤 `@` 뒤 도메인 전체가 허용 목록의 값과 정확히 같아야 한다 (접미어·포함 비교 금지) */
export function isAllowedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = lower.slice(at + 1);
  return allowedEmailDomains.some((allowed) => allowed === domain);
}

function assertSchoolEmail(email: string) {
  if (!isAllowedEmail(email)) {
    throw new AppError("INVALID_EMAIL_DOMAIN", "학교 이메일로만 가입할 수 있어요.");
  }
}

const tooMany = (message: string) => new AppError("RATE_LIMITED", message);

/**
 * POST /auth/email/code.
 * 가입 여부와 관계없이 같은 응답(204)을 준다. 이미 가입된 이메일에는 코드 대신 로그인 안내 메일을 보낸다.
 * 두 경우 모두 인증 건을 남겨 재발송 대기·하루 상한이 똑같이 걸리게 한다. (이미 가입된 경우 코드는 아무 데도 보내지 않으므로 쓸 수 없다)
 */
export async function sendSignupCode(email: string): Promise<void> {
  assertSchoolEmail(email);

  const now = Date.now();
  const [last, todayForEmail, todayTotal, existing] = await Promise.all([
    prisma.emailVerification.findFirst({ where: { email }, orderBy: { createdAt: "desc" } }),
    prisma.emailVerification.count({ where: { email, createdAt: { gte: new Date(now - DAY_MS) } } }),
    prisma.emailVerification.count({ where: { createdAt: { gte: new Date(now - DAY_MS) } } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (last && now - last.createdAt.getTime() < CODE_RESEND_COOLDOWN_SECONDS * 1000) {
    throw tooMany("인증 코드는 1분에 한 번만 받을 수 있어요.");
  }
  if (todayForEmail >= CODE_DAILY_LIMIT_PER_EMAIL) {
    throw tooMany("오늘 이 이메일로 받을 수 있는 인증 코드를 모두 받았어요. 내일 다시 시도해 주세요.");
  }
  if (todayTotal >= env.MAIL_DAILY_LIMIT) {
    throw tooMany("지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.");
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await prisma.emailVerification.create({
    data: { email, codeHash: hmac(code), expiresAt: new Date(now + CODE_TTL_MINUTES * 60_000) },
  });

  if (existing) {
    await sendMail({
      to: email,
      subject: "[찾음표] 이미 가입된 이메일이에요",
      text: "이 이메일로 이미 가입되어 있어요. 찾음표에서 로그인해 주세요. 요청하지 않았다면 이 메일은 무시해도 돼요.",
    });
    return;
  }
  await sendMail({
    to: email,
    subject: "[찾음표] 이메일 인증 코드",
    text: `인증 코드: ${code}\n${CODE_TTL_MINUTES}분 안에 입력해 주세요. 요청하지 않았다면 이 메일은 무시해도 돼요.`,
  });
}

/** POST /auth/email/verify. 가장 최근에 보낸 코드만, 한 번만 확인할 수 있다. */
export async function verifySignupCode(email: string, code: string) {
  const invalid = () => new AppError("INVALID_CODE", "인증 코드가 맞지 않아요.");
  const v = await prisma.emailVerification.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
  if (!v || v.consumedAt) throw invalid();
  if (v.verifiedAt) throw new AppError("INVALID_CODE", "이미 확인한 인증 코드예요. 다시 받아 주세요.");
  if (v.expiresAt < new Date()) throw new AppError("INVALID_CODE", "인증 코드가 만료됐어요. 다시 받아 주세요.");
  if (v.failCount >= CODE_MAX_FAILS) {
    throw new AppError("INVALID_CODE", "인증 코드를 여러 번 틀렸어요. 다시 받아 주세요.");
  }

  if (!hmacEquals(code, v.codeHash)) {
    await prisma.emailVerification.update({ where: { id: v.id }, data: { failCount: { increment: 1 } } });
    throw invalid();
  }

  // 동시에 같은 코드를 두 번 확인해도 한 번만 성공한다.
  const marked = await prisma.emailVerification.updateMany({
    where: { id: v.id, verifiedAt: null },
    data: { verifiedAt: new Date() },
  });
  if (marked.count !== 1) throw new AppError("INVALID_CODE", "이미 확인한 인증 코드예요. 다시 받아 주세요.");
  const { token, expiresAt } = signSignupToken(email, v.id);
  return { verificationToken: token, expiresAt: expiresAt.toISOString() };
}

/** POST /auth/signup. 가입용 토큰은 consumed_at으로 한 번만 쓸 수 있다. */
export async function signup(verificationToken: string, password: string): Promise<AuthResponse> {
  const { email, verificationId } = verifySignupToken(verificationToken);
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerification.updateMany({
        where: { id: verificationId, email, consumedAt: null, verifiedAt: { not: null } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new AppError("INVALID_CODE", "이미 사용한 인증이에요. 이메일 인증을 다시 해주세요.");
      }
      return tx.user.create({ data: { email, passwordHash, role: "USER" } });
    });
    return issueAuth(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("EMAIL_TAKEN", "이미 가입된 이메일이에요. 로그인해 주세요.");
    }
    throw err;
  }
}

/** 계정이 없을 때도 bcrypt 비교를 한 번 해서, 응답 시간으로 가입 여부가 드러나지 않게 한다. */
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

async function checkCredentials<U extends { role: Role; passwordHash: string }>(
  user: U | null,
  role: Role,
  password: string,
): Promise<U> {
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!ok || user?.role !== role) throw new AppError("UNAUTHORIZED", "이메일 또는 비밀번호가 맞지 않아요.");
  return user;
}

/** POST /auth/login: 분실자 계정만 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const user = await checkCredentials(await prisma.user.findUnique({ where: { email } }), "USER", password);
  return issueAuth(user);
}

/** POST /admin/auth/login: 관리자 계정만 */
export async function adminLogin(email: string, password: string): Promise<AdminAuthResponse> {
  const found = await prisma.user.findUnique({
    where: { email },
    include: { storagePlace: { select: { id: true, name: true } } },
  });
  const user = await checkCredentials(found, "ADMIN", password);
  return { ...issueAuth(user), storagePlace: user.storagePlace };
}

/** POST /auth/demo: 누를 때마다 새 체험 계정 (open-issues #1) */
export async function createDemoAccount(): Promise<AuthResponse> {
  const user = await prisma.user.create({
    data: { email: `demo-${randomUUID().slice(0, 8)}@demo.local`, passwordHash: UNUSABLE_PASSWORD, role: "DEMO" },
  });
  return issueAuth(user);
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toAuthUser(user);
}
