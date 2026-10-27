import {
  CATEGORY_LABELS,
  type Category,
  type FoundItemDetailResponse,
  type Role,
  VALUABLE_CATEGORIES,
} from "@chajeumpyo/shared";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { storage } from "../storage";
import { adminsInChargeOf, notifyUsers } from "./notifications";

/** 고가품은 앱 확인을 통과해도 보관처에서 대면으로 돌려준다 (QA W3, 위협 모델 T11) */
export const VALUABLE_PICKUP_NOTICE =
  "귀중품은 보관처에서 직원이 한 번 더 확인한 뒤 돌려드려요. 학생증을 가져가 주세요(저장하지 않아요).";

/** 상세에 주는 사진 링크 유효 시간 (초안) */
export const DETAIL_IMAGE_TTL_SECONDS = 10 * 60;

type Viewer = { userId: string; role: Role };

/**
 * GET /found-items/:id/detail (F-10, F-12)
 * - 이 계정이 통과(PASS 또는 확인 질문 정답)한 물건만
 * - 볼 때마다 열람 기록, 처음 공개되면 REGISTERED → REVEALED (체험 계정은 상태를 바꾸지 않음)
 * - 다른 계정이 이미 열람한 물건을 새 계정이 열람하면 맡은 관리자에게 알림 (체험 계정 제외)
 */
export async function revealFoundItem(viewer: Viewer, foundItemId: string): Promise<FoundItemDetailResponse> {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    include: {
      detail: true,
      building: { select: { id: true, name: true } },
      storagePlace: { select: { id: true, name: true, guideText: true } },
    },
  });
  if (!item?.detail || !item.category) throw new AppError("NOT_FOUND", "물건을 찾을 수 없어요.");
  // 수령·기한 만료로 사진과 비공개 정보를 지운 물건 (#33)
  const publicKey = item.detail.imagePublicKey;
  if (item.dataPurgedAt || !publicKey) {
    if (item.status === "CLAIMED") throw new AppError("ALREADY_CLAIMED", "이미 수령된 물건이에요.");
    throw new AppError("NOT_FOUND", "보관 기간이 지나 정보가 지워졌어요. 보관처에 문의해 주세요.");
  }

  const passed = await prisma.matchAttempt.findFirst({
    where: { userId: viewer.userId, foundItemId, OR: [{ result: "PASS" }, { answerCorrect: true }] },
    orderBy: { createdAt: "asc" },
  });
  if (!passed) throw new AppError("FORBIDDEN", "내 물건인지 확인을 통과해야 볼 수 있어요.");

  const isDemo = viewer.role === "DEMO";
  const status = await prisma.$transaction(async (tx) => {
    // 같은 물건의 열람은 하나씩 처리한다. 두 계정이 동시에 처음 열어도 "여러 계정 열람"을 놓치지 않게.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reveal:${foundItemId}`}, 0))`;
    const seenBefore = await tx.revealLog.count({ where: { userId: viewer.userId, foundItemId } });
    await tx.revealLog.create({ data: { userId: viewer.userId, foundItemId, matchAttemptId: passed.id } });
    if (isDemo) return item.status;

    await tx.foundItem.updateMany({ where: { id: foundItemId, status: "REGISTERED" }, data: { status: "REVEALED" } });

    if (seenBefore === 0) {
      const others = await tx.revealLog.findMany({
        where: { foundItemId, userId: { not: viewer.userId }, user: { role: { not: "DEMO" } } },
        distinct: ["userId"],
        select: { userId: true },
      });
      if (others.length > 0) {
        const label = CATEGORY_LABELS[item.category as Category];
        await notifyUsers(
          await adminsInChargeOf(item.storagePlaceId, tx),
          {
            type: "MULTI_REVEAL",
            foundItemId,
            message: `${item.building.name}의 ${label}을(를) ${others.length + 1}개 계정이 확인했어요. 수령할 때 본인 확인에 주의해 주세요.`,
          },
          tx,
        );
      }
    }
    return (await tx.foundItem.findUniqueOrThrow({ where: { id: foundItemId }, select: { status: true } })).status;
  });

  const imageUrlExpiresAt = new Date(Date.now() + DETAIL_IMAGE_TTL_SECONDS * 1000);
  return {
    id: item.id,
    category: item.category,
    color: item.detail.color,
    imageUrl: await storage.signedUrl(publicKey, DETAIL_IMAGE_TTL_SECONDS),
    imageUrlExpiresAt: imageUrlExpiresAt.toISOString(),
    building: item.building,
    storageType: item.storageType,
    storagePlace: item.storagePlace,
    status,
    foundAt: item.foundAt.toISOString(),
    isSeed: item.isSeed,
    pickupNotice: VALUABLE_CATEGORIES.includes(item.category) ? VALUABLE_PICKUP_NOTICE : null,
  };
}
