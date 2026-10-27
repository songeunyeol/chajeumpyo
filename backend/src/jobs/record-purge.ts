import { prisma } from "../lib/prisma";

/**
 * 수령 후 보관 기간(30일, 초안)이 지난 물건의 일치 시도·열람 기록을 지운다 (F-12, ERD 4장).
 * 열람 기록이 시도를 참조하므로 열람 기록부터 지운다.
 */
export async function purgeExpiredRecords(
  now = new Date(),
): Promise<{ items: number; reveals: number; attempts: number }> {
  const due = await prisma.pickup.findMany({
    where: { status: "COMPLETED", method: { not: "DEMO" }, purgeAfter: { lt: now } },
    select: { foundItemId: true },
    distinct: ["foundItemId"],
  });
  const ids = due.map((p) => p.foundItemId);
  if (ids.length === 0) return { items: 0, reveals: 0, attempts: 0 };
  return prisma.$transaction(async (tx) => {
    const reveals = await tx.revealLog.deleteMany({ where: { foundItemId: { in: ids } } });
    const attempts = await tx.matchAttempt.deleteMany({ where: { foundItemId: { in: ids } } });
    return { items: ids.length, reveals: reveals.count, attempts: attempts.count };
  });
}
