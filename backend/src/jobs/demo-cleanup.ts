import { env } from "../config/env";
import { prisma } from "../lib/prisma";

/**
 * 유효 기간이 지난 체험 계정과 그 계정의 기록을 지운다 (ERD 4장).
 * 일반 계정 기록이 잘못 지워지지 않도록 FK CASCADE 대신 여기서 순서대로 지운다.
 */
export async function cleanupExpiredDemoAccounts(now = new Date()): Promise<number> {
  const user = { role: "DEMO" as const, createdAt: { lt: new Date(now.getTime() - env.DEMO_TTL_HOURS * 3600_000) } };
  return prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { user } });
    await tx.pickup.deleteMany({ where: { user } });
    await tx.revealLog.deleteMany({ where: { user } });
    await tx.matchAttempt.deleteMany({ where: { user } });
    await tx.lostReport.deleteMany({ where: { user } });
    const { count } = await tx.user.deleteMany({ where: user });
    return count;
  });
}
