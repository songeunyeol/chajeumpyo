import { type Category, RELATED_CATEGORIES } from "@chajeumpyo/shared";
import { ATTR_WEIGHTS, CATEGORY_SCORE, PLACE_SCORE, TIME_SCORE, WEIGHTS } from "./policy";

export type ReportSide = {
  category: Category;
  lostFrom: Date;
  lostTo: Date;
  buildingId: number | null;
  color: string | null;
  brand: string | null;
};

export type ItemSide = {
  category: Category | null;
  categoryAlt: Category | null;
  foundAt: Date;
  buildingId: number | null;
  color: string | null;
  brand: string | null;
};

export type ScoreBreakdown = { attr: number; place: number; time: number; emb: number; total: number };

export function categoryScore(reported: Category, item: Pick<ItemSide, "category" | "categoryAlt">): number {
  if (item.category === reported) return CATEGORY_SCORE.exact;
  if (item.categoryAlt === reported) return CATEGORY_SCORE.alt;
  const related = RELATED_CATEGORIES[reported] ?? [];
  if ((item.category && related.includes(item.category)) || (item.categoryAlt && related.includes(item.categoryAlt))) {
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
    ATTR_WEIGHTS.category * categoryScore(report.category, item) +
    ATTR_WEIGHTS.color * (sameText(report.color, item.color) ? 1 : 0) +
    ATTR_WEIGHTS.brand * (sameText(report.brand, item.brand) ? 1 : 0);
  const place = placeScore(report.buildingId, item.buildingId);
  const time = timeScore(report.lostFrom, report.lostTo, item.foundAt);
  const emb = Math.min(1, Math.max(0, embeddingSimilarity ?? 0));
  const total = WEIGHTS.attr * attr + WEIGHTS.place * place + WEIGHTS.time * time + WEIGHTS.emb * emb;
  return { attr, place, time, emb, total };
}
