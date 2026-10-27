import { prisma } from "../lib/prisma";
import { RECORD_RETENTION_DAYS } from "../services/pickups";

/**
 * 확인 시도·열람·수령 기록을 보관 기간(30일)이 지나면 지운다 (F-12, QA B13, open-issues #26·#33).
 * - 수령된 물건: 수령 완료 30일 뒤
 * - 기한 만료된 물건: 보관 기한 30일 뒤
 * 열람 기록이 시도를 참조하므로 열람 기록부터 지운다. 체험 계정 기록은 체험 계정 정리 배치가 지운다.
 */
export async function purgeExpiredRecords(
  now = new Date(),
): Promise<{ items: number; reveals: number; attempts: number; pickups: number }> {
  const [claimed, expired] = await Promise.all([
    prisma.pickup.findMany({
      where: { status: "COMPLETED", method: { not: "DEMO" }, purgeAfter: { lt: now } },
      select: { foundItemId: true },
      distinct: ["foundItemId"],
    }),
    prisma.foundItem.findMany({
      where: {
        status: "EXPIRED",
        isSeed: false,
        expiresAt: { lt: new Date(now.getTime() - RECORD_RETENTION_DAYS * 86_400_000) },
      },
      select: { id: true },
    }),
  ]);
  const ids = [...new Set([...claimed.map((p) => p.foundItemId), ...expired.map((i) => i.id)])];
  if (ids.length === 0) return { items: 0, reveals: 0, attempts: 0, pickups: 0 };
  return prisma.$transaction(async (tx) => {
    const reveals = await tx.revealLog.deleteMany({ where: { foundItemId: { in: ids } } });
    const pickups = await tx.pickup.deleteMany({ where: { foundItemId: { in: ids }, method: { not: "DEMO" } } });
    const attempts = await tx.matchAttempt.deleteMany({ where: { foundItemId: { in: ids } } });
    return { items: ids.length, reveals: reveals.count, attempts: attempts.count, pickups: pickups.count };
  });
}
