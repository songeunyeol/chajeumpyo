import {
  type Candidate,
  type CandidateReason,
  type Category,
  RELATED_CATEGORIES,
  type Role,
  relatedCategories,
  subCategoryWithin,
} from "@chajeumpyo/shared";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { similarityToFoundItems } from "../repositories/embedding";
import { storage } from "../storage";
import { CANDIDATE_LIMIT, MAX_FAILED_ATTEMPTS } from "./policy";
import { categoryScore, type ScoreBreakdown, scoreCandidate } from "./score";

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

/** 신고 설명에서 AI가 읽은 속성. 세부 종류는 신고자가 고른 종류에 속할 때만 쓴다 */
function attrsOf(
  extracted: unknown,
  category: Category,
): { color: string | null; brand: string | null; subCategory: string | null } {
  const e = (extracted ?? {}) as { color?: unknown; brand?: unknown; subCategory?: unknown };
  return {
    color: typeof e.color === "string" ? e.color : null,
    brand: typeof e.brand === "string" ? e.brand : null,
    subCategory: subCategoryWithin(category, e.subCategory),
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

type EligibleItem = {
  id: string;
  category: Category | null;
  subCategory: string | null;
  foundAt: Date;
  buildingId: number | null;
  isSeed: boolean;
  claimLockedAt: Date | null;
  building: { id: number; name: string } | null;
  detail: { imageThumbKey: string | null; title?: string | null; description?: string | null } | null;
};
type Ranked = { item: EligibleItem & { category: Category }; score: ScoreBreakdown };

/**
 * 종류 조건. 기타(ETC)는 종류를 모르는 물건이라 모든 신고에 함께 찾지만,
 * 세부 종류가 정해진 기타(인형·키링, 화장품, 약)는 이미 무엇인지 아는 물건이라 기타 신고에서만 찾는다.
 * 휴대폰을 찾는데 인형·키링이 비슷한 물건으로 뜨던 문제 (QA 10/29)
 */
function categoryFilter(reported: Category, categories: Category[]): Prisma.FoundItemWhereInput[] {
  if (reported === "ETC") return [{ category: { in: categories } }, { categoryAlt: { in: categories } }];
  const specific = categories.filter((c) => c !== "ETC");
  return [{ category: { in: specific } }, { categoryAlt: { in: specific } }, { category: "ETC", subCategory: null }];
}

/**
 * 후보 범위 안의 물건을 모두 점수 순으로 줄 세운다.
 * 범위: 분실 시작 이후 등록, 등록됨·열람됨, 보관 기한 안, 1·2순위 종류가 연관 종류 묶음 안,
 * 체험 계정은 시드만·일반 계정은 시드 제외
 */
async function rankEligible(report: ReportForMatching, viewerRole: Role): Promise<Ranked[]> {
  if (report.status !== "OPEN") return [];
  const categories = relatedCategories(report.category);
  const now = new Date();

  const items = await prisma.foundItem.findMany({
    where: {
      status: { in: ["REGISTERED", "REVEALED"] },
      foundAt: { gte: report.lostFrom },
      OR: categoryFilter(report.category, categories),
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      isSeed: viewerRole === "DEMO",
    },
    select: {
      id: true,
      category: true,
      categoryAlt: true,
      subCategory: true,
      foundAt: true,
      buildingId: true,
      isSeed: true,
      claimLockedAt: true,
      building: { select: { id: true, name: true } },
      detail: { select: { color: true, brand: true, imageThumbKey: true, title: true, description: true } },
    },
  });
  if (items.length === 0) return [];

  const similarity = await similarityToFoundItems(
    report.id,
    items.map((i) => i.id),
  );
  const reportSide = { ...report, ...attrsOf(report.extractedAttributes, report.category) };

  return (
    items
      .filter((i): i is typeof i & { category: Category } => i.category !== null)
      .map((i) => ({
        item: i,
        score: scoreCandidate(
          reportSide,
          { ...i, color: i.detail?.color ?? null, brand: i.detail?.brand ?? null },
          similarity.get(i.id),
        ),
      }))
      // 종류가 신고와 무관하면 임베딩이 비슷해도 후보에서 뺀다.
      // 세부 종류가 비어 있어도 제목·설명의 인형·키링은 다른 종류 신고에서 뺀다 (QA 10/29).
      .filter(({ item }) => {
        if (categoryScore(report.category, item, reportSide.subCategory ?? null) <= 0) return false;
        if (report.category === "ETC" || item.category !== "ETC") return true;
        const text = `${item.detail?.title ?? ""} ${item.detail?.description ?? ""}`;
        return !/인형|피규어|키링/.test(text);
      })
      // 동점이면 최근 습득물 우선, 그다음 id로 고정해 같은 입력엔 같은 결과
      .sort(
        (a, b) =>
          b.score.total - a.score.total || +b.item.foundAt - +a.item.foundAt || a.item.id.localeCompare(b.item.id),
      )
  );
}

async function toScored(report: ReportForMatching, ranked: Ranked[]): Promise<ScoredCandidate[]> {
  const failures = await failedAttemptCounts(
    report.userId,
    ranked.map((r) => r.item.id),
  );
  return ranked.map(({ item, score }) => {
    const inPersonOnly = item.claimLockedAt !== null;
    const left = inPersonOnly ? 0 : Math.max(0, MAX_FAILED_ATTEMPTS - (failures.get(item.id) ?? 0));
    const category = item.category;
    return {
      foundItemId: item.id,
      category,
      subCategory: subCategoryWithin(category, item.subCategory),
      foundAt: item.foundAt.toISOString(),
      building: item.building,
      thumbKey: item.detail?.imageThumbKey ?? null,
      reasons: publicReasons(report, { category, buildingId: item.buildingId, foundAt: item.foundAt }),
      attemptsLeft: left,
      locked: left === 0,
      inPersonOnly,
      isSeed: item.isSeed,
      score,
    };
  });
}

/**
 * 신고의 후보를 고른다 (F-07).
 * 1) 범위 안의 물건(rankEligible) 2) 점수로 상위 CANDIDATE_LIMIT개
 * 3) 습득 시각 최신순으로 돌려준다(점수 순서를 드러내지 않음)
 */
export async function findCandidates(report: ReportForMatching, viewerRole: Role): Promise<ScoredCandidate[]> {
  const top = (await rankEligible(report, viewerRole)).slice(0, CANDIDATE_LIMIT);
  return (await toScored(report, top)).sort(
    (a, b) => b.foundAt.localeCompare(a.foundAt) || a.foundItemId.localeCompare(b.foundItemId),
  );
}

/** 신고자에게 이 물건들을 후보로 보여 줬다고 남긴다. 이미 있으면 그대로 둔다 */
export async function recordExposure(
  lostReportId: string,
  foundItemIds: string[],
  db: Pick<Prisma.TransactionClient, "candidateExposure"> = prisma,
): Promise<void> {
  if (foundItemIds.length === 0) return;
  await db.candidateExposure.createMany({
    data: foundItemIds.map((foundItemId) => ({ lostReportId, foundItemId })),
    skipDuplicates: true,
  });
}

/**
 * 판정을 요청할 수 있는 후보인지 (F-08, open-issues #20).
 * - 지금 상위 CANDIDATE_LIMIT개 안이거나
 * - 이 신고의 후보로 보여 준 적이 있고(candidate_exposure) 지금도 후보 범위 안이면 된다.
 * 새 습득물이 들어와 보던 물건이 상위에서 밀려나도 판정할 수 있게 하되,
 * 보여 준 적 없는 물건을 id로 찔러 보는 것(QA B5, 위협 모델 T2)은 그대로 막는다.
 */
export async function findClaimableCandidate(
  report: ReportForMatching,
  viewerRole: Role,
  foundItemId: string,
): Promise<ScoredCandidate | null> {
  const ranked = await rankEligible(report, viewerRole);
  const index = ranked.findIndex((r) => r.item.id === foundItemId);
  if (index < 0) return null;
  if (index >= CANDIDATE_LIMIT) {
    const shown = await prisma.candidateExposure.findUnique({
      where: { lostReportId_foundItemId: { lostReportId: report.id, foundItemId } },
      select: { foundItemId: true },
    });
    if (!shown) return null;
  }
  const [candidate] = await toScored(report, [ranked[index] as Ranked]);
  return candidate ?? null;
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
