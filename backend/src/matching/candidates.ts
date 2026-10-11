import { type Candidate, type Role, relatedCategories } from "@chajeumpyo/shared";
import { prisma } from "../lib/prisma";
import { similarityToFoundItems } from "../repositories/embedding";
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

export type ScoredCandidate = Candidate & { score: ScoreBreakdown };

function attrsOf(extracted: unknown): { color: string | null; brand: string | null } {
  const e = (extracted ?? {}) as { color?: unknown; brand?: unknown };
  return {
    color: typeof e.color === "string" ? e.color : null,
    brand: typeof e.brand === "string" ? e.brand : null,
  };
}

/** 계정·습득물별 실패 횟수 (FAIL 판정 + 확인 질문 오답) */
export async function failedAttemptCounts(userId: string, foundItemIds: string[]): Promise<Map<string, number>> {
  if (foundItemIds.length === 0) return new Map();
  const rows = await prisma.matchAttempt.groupBy({
    by: ["foundItemId"],
    where: {
      userId,
      foundItemId: { in: foundItemIds },
      OR: [{ result: "FAIL" }, { answerCorrect: false }],
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
      isSeed: true,
      building: { select: { id: true, name: true } },
      detail: { select: { color: true, brand: true } },
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
      const left = Math.max(0, MAX_FAILED_ATTEMPTS - (failures.get(item.id) ?? 0));
      return {
        foundItemId: item.id,
        category: item.category as Candidate["category"],
        foundAt: item.foundAt.toISOString(),
        building: item.building,
        attemptsLeft: left,
        locked: left === 0,
        isSeed: item.isSeed,
        score,
      };
    })
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt) || a.foundItemId.localeCompare(b.foundItemId));
}

/** 응답용: 점수를 뺀다 */
export function publicCandidates(list: ScoredCandidate[]): Candidate[] {
  return list.map(({ score: _score, ...c }) => c);
}
