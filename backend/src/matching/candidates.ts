import {
  type Candidate,
  type CandidateReason,
  RELATED_CATEGORIES,
  type Role,
  relatedCategories,
} from "@chajeumpyo/shared";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { similarityToFoundItems } from "../repositories/embedding";
import { storage } from "../storage";
import { CANDIDATE_LIMIT, MAX_FAILED_ATTEMPTS } from "./policy";
import { type ScoreBreakdown, scoreCandidate } from "./score";

type ReportForMatching = {
  id: string;
  userId: string;
  category: Candidate["category"];
  lostFrom: Date;
  lostTo: Date;
  buildingId: number | null;
  status: string;
  extractedAttributes: unknown;
};

/** 서버 안에서 쓰는 후보. 사진은 키로 들고 있다가 응답할 때만 서명한다 */
export type ScoredCandidate = Omit<Candidate, "thumbnailUrl"> & { thumbKey: string | null; score: ScoreBreakdown };

/** 후보 사진 서명 URL 유효 시간 */
export const THUMBNAIL_URL_TTL_SECONDS = 600;
/** "잃어버린 뒤 곧 습득" 근거의 기준 */
const SOON_AFTER_HOURS = 2;

/** 공개 정보와 신고자 본인이 적은 값만으로 근거를 만든다. 2순위 종류(비공개)는 쓰지 않는다 */
export function publicReasons(
  report: Pick<ReportForMatching, "category" | "buildingId" | "lostFrom" | "lostTo">,
  item: { category: Candidate["category"]; buildingId: number | null; foundAt: Date },
): CandidateReason[] {
  const reasons: CandidateReason[] = [];
  if (item.category === report.category) reasons.push("SAME_CATEGORY");
  else if (RELATED_CATEGORIES[report.category]?.includes(item.category)) reasons.push("RELATED_CATEGORY");
  if (report.buildingId !== null && report.buildingId === item.buildingId) reasons.push("SAME_BUILDING");
  const hoursAfterLost = (item.foundAt.getTime() - report.lostTo.getTime()) / 3600_000;
  if (item.foundAt >= report.lostFrom && hoursAfterLost <= SOON_AFTER_HOURS) reasons.push("FOUND_SOON_AFTER");
  return reasons;
}

function attrsOf(extracted: unknown): { color: string | null; brand: string | null } {
  const e = (extracted ?? {}) as { color?: unknown; brand?: unknown };
  return {
    color: typeof e.color === "string" ? e.color : null,
    brand: typeof e.brand === "string" ? e.brand : null,
  };
}

/** 실패로 세는 시도: FAIL 판정 + 확인 질문 오답 */
export const FAILED_ATTEMPT = {
  OR: [{ result: "FAIL" }, { answerCorrect: false }],
} satisfies Prisma.MatchAttemptWhereInput;

/** 계정·습득물별 실패 횟수 */
export async function failedAttemptCounts(
  userId: string,
  foundItemIds: string[],
  db: Pick<Prisma.TransactionClient, "matchAttempt"> = prisma,
): Promise<Map<string, number>> {
  if (foundItemIds.length === 0) return new Map();
  const rows = await db.matchAttempt.groupBy({
    by: ["foundItemId"],
    where: {
      userId,
      foundItemId: { in: foundItemIds },
      ...FAILED_ATTEMPT,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.foundItemId, r._count._all]));
}

/**
 * 신고의 후보를 고른다 (F-07).
 * 1) 범위: 분실 시작 이후 등록, 등록됨·열람됨, 보관 기한 안, 1·2순위 종류가 연관 종류 묶음 안,
 *    체험 계정은 시드만·일반 계정은 시드 제외
 * 2) 점수로 상위 CANDIDATE_LIMIT개 → 3) 습득 시각 최신순으로 돌려준다(점수 순서를 드러내지 않음)
 */
export async function findCandidates(report: ReportForMatching, viewerRole: Role): Promise<ScoredCandidate[]> {
  if (report.status !== "OPEN") return [];
  const categories = relatedCategories(report.category);
  const now = new Date();

  const items = await prisma.foundItem.findMany({
    where: {
      status: { in: ["REGISTERED", "REVEALED"] },
      foundAt: { gte: report.lostFrom },
      OR: [{ category: { in: categories } }, { categoryAlt: { in: categories } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      isSeed: viewerRole === "DEMO",
    },
    select: {
      id: true,
      category: true,
      categoryAlt: true,
      foundAt: true,
      buildingId: true,
      floor: true,
      isSeed: true,
      claimLockedAt: true,
      building: { select: { id: true, name: true } },
      detail: { select: { color: true, brand: true, imageThumbKey: true } },
    },
  });
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const [similarity, failures] = await Promise.all([
    similarityToFoundItems(report.id, ids),
    failedAttemptCounts(report.userId, ids),
  ]);
  const reportSide = { ...report, ...attrsOf(report.extractedAttributes) };

  const scored = items
    .filter((i) => i.category !== null)
    .map((i) => ({
      item: i,
      score: scoreCandidate(
        reportSide,
        { ...i, color: i.detail?.color ?? null, brand: i.detail?.brand ?? null },
        similarity.get(i.id),
      ),
    }))
    // 동점이면 최근 습득물 우선, 그다음 id로 고정해 같은 입력엔 같은 결과
    .sort(
      (a, b) =>
        b.score.total - a.score.total || +b.item.foundAt - +a.item.foundAt || a.item.id.localeCompare(b.item.id),
    )
    .slice(0, CANDIDATE_LIMIT);

  return scored
    .map(({ item, score }) => {
      const inPersonOnly = item.claimLockedAt !== null;
      const left = inPersonOnly ? 0 : Math.max(0, MAX_FAILED_ATTEMPTS - (failures.get(item.id) ?? 0));
      const category = item.category as Candidate["category"];
      return {
        foundItemId: item.id,
        category,
        foundAt: item.foundAt.toISOString(),
        building: item.building,
        floor: item.floor,
        thumbKey: item.detail?.imageThumbKey ?? null,
        reasons: publicReasons(report, { category, buildingId: item.buildingId, foundAt: item.foundAt }),
        attemptsLeft: left,
        locked: left === 0,
        inPersonOnly,
        isSeed: item.isSeed,
        score,
      };
    })
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt) || a.foundItemId.localeCompare(b.foundItemId));
}

/** 응답용: 점수를 빼고, 강한 블러 사진만 서명 URL로 바꾼다 */
export async function publicCandidates(list: ScoredCandidate[]): Promise<Candidate[]> {
  return Promise.all(
    list.map(async ({ score: _score, thumbKey, ...c }) => ({
      ...c,
      thumbnailUrl: thumbKey ? await storage.signedUrl(thumbKey, THUMBNAIL_URL_TTL_SECONDS) : null,
    })),
  );
}
