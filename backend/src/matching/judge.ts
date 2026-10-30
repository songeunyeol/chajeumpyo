import type { AiFeature, FeatureComparison, MatchResult } from "@chajeumpyo/shared";
import { PASS_MATCH_RATIO } from "./policy";
import { isAskable } from "./questions";

export type Judgment = {
  result: MatchResult;
  matches: number;
  contradictions: number;
  /** BORDERLINE일 때 질문할 습득물 특징 */
  questionFeature: AiFeature | null;
};

/**
 * 판정 기준 (F-08, open-issues #7, 10/30 은열 확정으로 바꿈)
 * - 일치는 특징만 센다(같은 저장 특징을 여러 번 맞혀도 하나). 색·브랜드는 모순에만 들어간다.
 * - 통과: 모순 0이고, 습득물 특징 종류 중 PASS_MATCH_RATIO(75%) 이상을 맞혔을 때만. 설명 한 줄로 쉽게 통과하지 않게.
 * - 그 밖에는 바로 실패시키지 않고 객관식으로 확인한다. 진짜 주인이 하나를 잘못 기억해도 질문에서 다시 고를 수 있게.
 *   질문 순서: 신고에 적지 않은 특징 → 모순으로 나온 특징 → 아직 맞히지 않은 특징.
 *   찍기 남용은 claims.ts가 막는다(맞힌 특징 없는 찍기는 계정·물건마다 한 번, 틀리면 실패로 센다).
 * - 물어볼 특징이 없으면(남은 특징이 습득자 설명에서 나온 것뿐 등) 맞힌 것만 있고 모순이 없을 때 통과, 아니면 실패.
 * - 습득물에 특징이 하나도 없으면 아무도 통과할 수 없다 (open-issues #17, 미결)
 */
export function judge(
  comparison: FeatureComparison,
  askableFeatures: AiFeature[],
  reportedKeys: string[],
  storedFeatures: AiFeature[] = askableFeatures,
): Judgment {
  const matchedKeys = new Set(
    comparison.features.filter((f) => f.verdict === "MATCH").map((f) => f.storedKey ?? f.reportedKey),
  );
  const matches = matchedKeys.size;
  const contradictions =
    comparison.features.filter((f) => f.verdict === "CONTRADICT").length +
    (comparison.color === "CONTRADICT" ? 1 : 0) +
    (comparison.brand === "CONTRADICT" ? 1 : 0);

  const storedKeys = new Set(storedFeatures.map((f) => f.key));
  const matchedStored = [...matchedKeys].filter((k) => storedKeys.has(k as AiFeature["key"])).length;
  const ratio = storedKeys.size > 0 ? matchedStored / storedKeys.size : 0;
  if (contradictions === 0 && matches > 0 && ratio >= PASS_MATCH_RATIO) {
    return { result: "PASS", matches, contradictions, questionFeature: null };
  }

  const mentioned = new Set(reportedKeys);
  const contradicted = new Set(comparison.features.filter((f) => f.verdict === "CONTRADICT").map((f) => f.storedKey));
  const askable = askableFeatures.filter(isAskable);
  const questionFeature =
    askable.find((f) => !mentioned.has(f.key)) ??
    askable.find((f) => contradicted.has(f.key)) ??
    askable.find((f) => !matchedKeys.has(f.key)) ??
    null;
  if (!questionFeature) {
    const result = matches > 0 && contradictions === 0 ? "PASS" : "FAIL";
    return { result, matches, contradictions, questionFeature: null };
  }
  return { result: "BORDERLINE", matches, contradictions, questionFeature };
}
