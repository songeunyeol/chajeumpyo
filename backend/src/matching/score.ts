import { type Category, RELATED_CATEGORIES, relatedBySubCategory, unrelatedBySubCategory } from "@chajeumpyo/shared";
import { ATTR_WEIGHTS, CATEGORY_SCORE, PLACE_SCORE, SUB_CATEGORY_MISMATCH_SCORE, TIME_SCORE, WEIGHTS } from "./policy";

export type ReportSide = {
  category: Category;
  /** 신고 설명에서 AI가 읽은 세부 종류 (신고 종류에 속한 값만) */
  subCategory?: string | null;
  lostFrom: Date;
  lostTo: Date;
  buildingId: number | null;
  color: string | null;
  brand: string | null;
};

export type ItemSide = {
  category: Category | null;
  categoryAlt: Category | null;
  subCategory?: string | null;
  foundAt: Date;
  buildingId: number | null;
  color: string | null;
  brand: string | null;
};

export type ScoreBreakdown = { attr: number; place: number; time: number; emb: number; total: number };

export function categoryScore(
  reported: Category,
  item: Pick<ItemSide, "category" | "categoryAlt" | "subCategory">,
  reportedSub: string | null = null,
): number {
  if (item.category === reported) {
    const bothKnown = reportedSub && item.subCategory;
    return bothKnown && reportedSub !== item.subCategory ? SUB_CATEGORY_MISMATCH_SCORE : CATEGORY_SCORE.exact;
  }
  // 무엇인지 아는 기타 신고(화장품·약·인형 키링)는 기타로 본 물건(1·2순위)과 세부 종류 묶음만 찾는다.
  // 종류를 아는 다른 물건(마우스 등)이 "기타는 모든 종류와 묶인다"로 끼어들던 문제 (10/31 시연 영상: 화장품 신고 ↔ 마우스).
  // 세부 종류를 모르는 기타 신고는 지금처럼 모든 종류를 본다
  if (reported === "ETC" && reportedSub) {
    if (item.categoryAlt === "ETC") return CATEGORY_SCORE.alt;
    return relatedBySubCategory(reported, reportedSub, item.category ?? null, item.subCategory ?? null)
      ? CATEGORY_SCORE.related
      : 0;
  }
  // 1순위 세부 종류가 신고와 관계없으면(이어폰 신고 ↔ 마우스) 2순위 종류로도 후보에 넣지 않는다.
  // 세부 종류까지 정해진 1순위가 더 확실한 정보라 2순위가 이를 뒤집지 않게 한다 (QA 10/31)
  if (unrelatedBySubCategory(reported, reportedSub, item.category, item.subCategory ?? null)) return 0;
  if (item.categoryAlt === reported) return CATEGORY_SCORE.alt;
  const related = RELATED_CATEGORIES[reported] ?? [];
  const byMain = item.category !== null && related.includes(item.category);
  if (byMain || (item.categoryAlt && related.includes(item.categoryAlt))) return CATEGORY_SCORE.related;
  if (relatedBySubCategory(reported, reportedSub, item.category ?? null, item.subCategory ?? null)) {
    return CATEGORY_SCORE.related;
  }
  if (reported === "ETC" || item.category === "ETC" || item.categoryAlt === "ETC") return CATEGORY_SCORE.etc;
  return 0;
}

/** 공백·대소문자를 무시하고 한쪽이 다른 쪽을 포함하면 같다고 본다 ("흰색" ↔ "흰색 계열") */
function sameText(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.replace(/\s+/g, "").toLowerCase();
  const y = b.replace(/\s+/g, "").toLowerCase();
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

export function placeScore(reportBuildingId: number | null, itemBuildingId: number | null): number {
  if (reportBuildingId === null || itemBuildingId === null) return PLACE_SCORE.unknown;
  return reportBuildingId === itemBuildingId ? PLACE_SCORE.same : PLACE_SCORE.other;
}

export function timeScore(lostFrom: Date, lostTo: Date, foundAt: Date): number {
  if (foundAt < lostFrom) return 0;
  const hoursAfter = Math.max(0, (foundAt.getTime() - lostTo.getTime()) / 3600_000);
  return TIME_SCORE.find((t) => hoursAfter <= t.withinHours)?.score ?? 0;
}

/** 후보 고르기 점수 (F-07). 판정(F-08)에는 쓰지 않는다. */
export function scoreCandidate(
  report: ReportSide,
  item: ItemSide,
  embeddingSimilarity: number | undefined,
): ScoreBreakdown {
  const attr =
    ATTR_WEIGHTS.category * categoryScore(report.category, item, report.subCategory ?? null) +
    ATTR_WEIGHTS.color * (sameText(report.color, item.color) ? 1 : 0) +
    ATTR_WEIGHTS.brand * (sameText(report.brand, item.brand) ? 1 : 0);
  const place = placeScore(report.buildingId, item.buildingId);
  const time = timeScore(report.lostFrom, report.lostTo, item.foundAt);
  const emb = Math.min(1, Math.max(0, embeddingSimilarity ?? 0));
  const total = WEIGHTS.attr * attr + WEIGHTS.place * place + WEIGHTS.time * time + WEIGHTS.emb * emb;
  return { attr, place, time, emb, total };
}
