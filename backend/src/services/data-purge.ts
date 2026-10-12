import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { storage } from "../storage";

// 개인정보 보관 기간 (open-issues #33, QA B13, 위협 모델 3장)
// - 수령이 끝나면 사진과 비공개 정보를 바로 지운다. 종류·건물·날짜·상태는 통계(F-15)를 위해 남긴다.
// - 수령되지 않은 물건은 보관 기한(등록 30일)이 지나면 기한 만료로 바꾸고 같은 방식으로 지운다.

/**
 * 물건 하나의 사진(원본·공개본·후보용 블러본)과 비공개 정보·임베딩을 지운다.
 * 여러 번 불러도 같은 결과(이미 지웠으면 아무것도 안 함). 저장소 삭제가 실패하면 throw하고 DB는 그대로 둔다.
 */
export async function purgeFoundItemData(foundItemId: string, now = new Date()): Promise<boolean> {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    select: {
      dataPurgedAt: true,
      isSeed: true,
      detail: { select: { imageOriginalKey: true, imagePublicKey: true, imageThumbKey: true } },
    },
  });
  // 시드는 다음 심사위원도 체험해야 하므로 지우지 않는다 (F-05)
  if (!item || item.dataPurgedAt || item.isSeed) return false;

  const d = item.detail;
  const keys = [d?.imageOriginalKey, d?.imagePublicKey, d?.imageThumbKey].filter((k): k is string => !!k);
  // 사진부터 지운다. 중간에 실패하면 DB를 바꾸지 않아 정기 작업이 다시 시도한다.
  for (const key of keys) await storage.delete(key);

  await prisma.$transaction(async (tx) => {
    if (d) {
      await tx.foundItemDetail.update({
        where: { foundItemId },
        data: {
          imageOriginalKey: null,
          imagePublicKey: null,
          imageThumbKey: null,
          color: null,
          brand: null,
          features: [],
          description: null,
          title: null,
        },
      });
      await tx.$executeRaw`UPDATE found_item_detail SET embedding = NULL, raw_ai_response = NULL WHERE found_item_id = ${foundItemId}::uuid`;
    }
    await tx.foundItem.update({ where: { id: foundItemId }, data: { dataPurgedAt: now } });
  });
  return true;
}

/** 수령 직후 호출. 실패해도 수령은 이미 끝났으므로 로그만 남기고, 정기 작업이 다시 지운다. */
export async function purgeAfterClaimSafely(foundItemId: string): Promise<void> {
  try {
    await purgeFoundItemData(foundItemId);
  } catch (err) {
    logger.error({ err, foundItemId }, "수령 후 사진·비공개 정보 삭제 실패 → 정기 작업이 다시 시도");
  }
}

/** 정기 작업: 수령됐는데 아직 안 지운 물건 (수령 직후 삭제가 실패한 경우) */
export async function purgeClaimedItems(now = new Date()): Promise<number> {
  const items = await prisma.foundItem.findMany({
    where: { status: "CLAIMED", dataPurgedAt: null, isSeed: false },
    select: { id: true },
  });
  let purged = 0;
  for (const { id } of items) {
    try {
      if (await purgeFoundItemData(id, now)) purged++;
    } catch (err) {
      logger.error({ err, foundItemId: id }, "수령 물건 정리 실패");
    }
  }
  return purged;
}

/** 정기 작업: 보관 기한이 지난 미수령 물건을 기한 만료로 바꾸고 지운다 (시드 제외) */
export async function expireUnclaimedItems(now = new Date()): Promise<number> {
  const due = await prisma.foundItem.findMany({
    where: {
      status: { in: ["REGISTERED", "REVEALED", "REVIEW", "ANALYZING"] },
      isSeed: false,
      expiresAt: { lt: now },
    },
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of due) {
    // 같은 순간 수령 처리와 겹치지 않게, 아직 미수령 상태일 때만 만료로 바꾼다
    const changed = await prisma.foundItem.updateMany({
      where: { id, status: { in: ["REGISTERED", "REVEALED", "REVIEW", "ANALYZING"] } },
      data: { status: "EXPIRED" },
    });
    if (changed.count === 0) continue;
    expired++;
    try {
      await purgeFoundItemData(id, now);
    } catch (err) {
      logger.error({ err, foundItemId: id }, "기한 만료 물건 정리 실패 → 다음 정기 작업에서 다시");
    }
  }
  // 만료로 바꿨지만 지우지 못한 것도 다시 시도
  const leftovers = await prisma.foundItem.findMany({
    where: { status: "EXPIRED", dataPurgedAt: null, isSeed: false },
    select: { id: true },
  });
  for (const { id } of leftovers) {
    try {
      await purgeFoundItemData(id, now);
    } catch (err) {
      logger.error({ err, foundItemId: id }, "기한 만료 물건 정리 재시도 실패");
    }
  }
  return expired;
}
