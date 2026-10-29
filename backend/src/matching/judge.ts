import type { AiFeature, FeatureComparison, MatchResult } from "@chajeumpyo/shared";
import { isAskable } from "./questions";

export type Judgment = {
  result: MatchResult;
  matches: number;
  contradictions: number;
  /** BORDERLINE일 때 질문할 습득물 특징 */
  questionFeature: AiFeature | null;
};

/**
 * 판정 기준 (F-08, open-issues #7)
 * - 일치는 특징만 센다. 색·브랜드는 모순에만 들어간다.
 * - 통과: 일치 ≥ 1, 모순 0 / 경계: 일치 ≥ 1, 모순 ≥ 1, 또는 일치 0·모순 0 / 실패: 일치 0, 모순 ≥ 1
 * - 일치 0·모순 0(설명에 특징이 없거나 다른 특징만 적음)은 숨은 특징을 묻는 유도 질문으로 한 번 더 확인한다 (10/29 결정).
 *   평범한 물건 주인도 사진을 떠올려 답할 수 있게. 틀리면 실패로 센다.
 * - 경계인데 신고에 적지 않은 질문 가능한 특징이 없으면: 일치가 1개 이상이면 모순으로 나온 특징을 객관식으로 다시 묻고,
 *   일치가 없으면 실패 (10/29 평가: 진짜 주인이 한 특징을 다르게 표현하면 "일치 1·모순 1"로 실패했다. 이미 하나는 맞혔으므로
 *   보기 중에서 고르게 한다. 일치 없이 다시 묻는 것은 찍을 기회만 늘려 막는다)
 * - 습득물에 특징이 하나도 없으면 아무도 통과할 수 없다 (open-issues #17, 미결)
 */
export function judge(comparison: FeatureComparison, storedFeatures: AiFeature[], reportedKeys: string[]): Judgment {
  const matches = comparison.features.filter((f) => f.verdict === "MATCH").length;
  const contradictions =
    comparison.features.filter((f) => f.verdict === "CONTRADICT").length +
    (comparison.color === "CONTRADICT" ? 1 : 0) +
    (comparison.brand === "CONTRADICT" ? 1 : 0);

  if (matches === 0 && contradictions > 0) return { result: "FAIL", matches, contradictions, questionFeature: null };
  if (matches > 0 && contradictions === 0) return { result: "PASS", matches, contradictions, questionFeature: null };

  const mentioned = new Set(reportedKeys);
  const contradicted = new Set(comparison.features.filter((f) => f.verdict === "CONTRADICT").map((f) => f.storedKey));
  const questionFeature =
    storedFeatures.find((f) => isAskable(f) && !mentioned.has(f.key)) ??
    (matches > 0 ? (storedFeatures.find((f) => isAskable(f) && contradicted.has(f.key)) ?? null) : null);
  if (!questionFeature) return { result: "FAIL", matches, contradictions, questionFeature: null };
  return { result: "BORDERLINE", matches, contradictions, questionFeature };
}
