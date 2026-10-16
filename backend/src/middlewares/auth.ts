import type { Role } from "@chajeumpyo/shared";
import type { RequestHandler, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/tokens";

export type AuthContext = {
  userId: string;
  email: string;
  role: Role;
  /** 관리자의 소속 보관처 */
  storagePlaceId: number | null;
};

/**
 * Authorization: Bearer 토큰을 확인하고 res.locals.auth에 담는다.
 * 토큰만 믿지 않고 계정을 다시 읽는다: 삭제된 체험 계정이나 권한이 바뀐 계정을 바로 막기 위해서다.
 */
export function requireAuth(...roles: Role[]): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AppError("UNAUTHORIZED", "로그인이 필요해요.");
    const payload = verifyAccessToken(header.slice("Bearer ".length));

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, storagePlaceId: true, createdAt: true },
    });
    if (!user) throw new AppError("UNAUTHORIZED", "로그인이 필요해요.");
    if (user.role === "DEMO" && Date.now() - user.createdAt.getTime() > env.DEMO_TTL_HOURS * 3600_000) {
      throw new AppError("UNAUTHORIZED", "체험 시간이 끝났어요. 다시 체험해 보기를 눌러주세요.");
    }
    if (roles.length > 0 && !roles.includes(user.role)) throw new AppError("FORBIDDEN", "권한이 없어요.");

    const auth: AuthContext = {
      userId: user.id,
      email: user.email,
      role: user.role,
      storagePlaceId: user.storagePlaceId,
    };
    res.locals.auth = auth;
    next();
  };
}

/** 회원 권한: 분실자, 체험 계정 */
export const requireMember = () => requireAuth("USER", "DEMO");
export const requireAdmin = () => requireAuth("ADMIN");

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw new Error("requireAuth 미들웨어 없이 getAuth를 불렀어요.");
  return auth;
}
