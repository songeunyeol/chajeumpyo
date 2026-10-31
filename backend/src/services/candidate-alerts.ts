import { type Category, relatedCategories } from "@chajeumpyo/shared";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { findCandidates, recordExposure } from "../matching/candidates";
import { newCandidateMessage, notificationItemLabel } from "./notifications";

/**
 * 습득물이 등록됨(REGISTERED)이 되면, 이 물건이 후보로 들어가는 열린 신고의 주인에게 알린다 (F-13).
 * - 종류(연관 묶음·2순위 포함)와 시간이 맞는 열린 신고를 찾고
 * - 그 신고의 실제 후보(상위 CANDIDATE_LIMIT개)에 이 물건이 들어갈 때만 알린다. 목록에 없는 물건을 알리면 헷갈린다.
 * - 시드 물건은 체험 계정 신고에만, 일반 물건은 일반 계정 신고에만
 * - 같은 사람에게 같은 물건은 한 번만. 한 사람이 신고를 여러 개 열어 두면 신고마다 알림이 쌓여
 *   목록에 같은 알림이 여러 번 보였다(QA 10/30). 알림은 가장 최근 신고에 붙이고, 노출 기록은 신고마다 남긴다.
 * 실패해도 등록 자체는 성공으로 둔다(에러는 로그만 남김).
 */
export async function alertNewCandidate(foundItemId: string): Promise<number> {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    include: { building: { select: { name: true } } },
  });
  if (!item?.category || item.status !== "REGISTERED") return 0;

  const categories = new Set<Category>([
    ...relatedCategories(item.category),
    ...(item.categoryAlt ? relatedCategories(item.categoryAlt) : []),
  ]);
  const reports = await prisma.lostReport.findMany({
    where: {
      status: "OPEN",
      category: { in: [...categories] },
      lostFrom: { lte: item.foundAt },
      user: item.isSeed ? { role: "DEMO" } : { role: "USER" },
      notifications: { none: { foundItemId, type: "NEW_CANDIDATE" } },
    },
    include: { user: { select: { role: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  // 이미 이 물건 알림을 받은 사람 (다른 신고로, 또는 이번 실행에서 먼저)
  const notified = new Set(
    (
      await prisma.notification.findMany({
        where: { foundItemId, type: "NEW_CANDIDATE", userId: { in: [...new Set(reports.map((r) => r.userId))] } },
        select: { userId: true },
      })
    ).map((n) => n.userId),
  );

  const message = newCandidateMessage(
    item.building?.name ?? null,
    notificationItemLabel({ ...item, category: item.category }),
  );
  let sent = 0;
  for (const report of reports) {
    const candidates = await findCandidates(report, report.user.role);
    if (!candidates.some((c) => c.foundItemId === foundItemId)) continue;
    // 알림으로 알려 준 물건도 보여 준 후보로 남긴다 (나중에 상위에서 밀려나도 판정할 수 있게)
    await recordExposure(report.id, [foundItemId]);
    if (notified.has(report.userId)) continue;
    await prisma.notification.create({
      data: { userId: report.userId, type: "NEW_CANDIDATE", foundItemId, lostReportId: report.id, message },
    });
    notified.add(report.userId);
    sent++;
  }
  return sent;
}

/** 등록 흐름에서 부를 때: 실패해도 throw하지 않고 로그만 남긴다 */
export function alertNewCandidateSafely(foundItemId: string): Promise<void> {
  return alertNewCandidate(foundItemId).then(
    (sent) => {
      if (sent > 0) logger.info({ foundItemId, sent }, "새 후보 알림");
    },
    (err) => logger.error({ err, foundItemId }, "새 후보 알림 실패"),
  );
}
