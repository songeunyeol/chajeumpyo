import type { AiFeature, FeatureComparison, MatchResult } from "@chajeumpyo/shared";
import { PASS_MATCH_RATIO } from "./policy";
import { isAskable, isMemorable } from "./questions";

export type Judgment = {
  result: MatchResult;
  matches: number;
  /** 특징끼리 틀린 개수. 실패(기회 차감)는 이것이 있을 때만 */
  contradictions: number;
  /** 색·브랜드가 다른 개수. 바로 통과만 막고, 이것만으로는 실패시키지 않는다 (10/31 실사용 영상) */
  softContradictions: number;
  /** BORDERLINE일 때 질문할 습득물 특징 */
  questionFeature: AiFeature | null;
};

/**
 * 판정 기준 (F-08, open-issues #7, 10/30 은열 확정으로 바꿈)
 * - 일치는 특징만 센다(같은 저장 특징을 여러 번 맞혀도 하나). 색·브랜드는 모순에만 들어간다.
 * - 통과: 모순 0이고, 습득물 특징 종류 중 PASS_MATCH_RATIO(75%) 이상을 맞혔을 때만. 설명 한 줄로 쉽게 통과하지 않게.
 * - 맞힌 특징이 하나도 없는데 모순이 있으면 바로 실패(10/31 B안). 틀린 특징만 적은 사칭이 객관식 찍기로 넘어가지 않게.
 * - 그 밖에는 바로 실패시키지 않고 객관식으로 확인한다. 진짜 주인이 하나를 잘못 기억해도(다른 특징은 맞힘) 질문에서 다시 고를 수 있게.
 *   질문 순서: 신고에 적지 않은 특징 → 모순으로 나온 특징 → 아직 맞히지 않은 특징.
 *   흠집·무늬는 주인도 잘 몰라서, 다른 특징으로 물을 수 없을 때만 고른다 (10/31 기획 피드백).
 *   찍기 남용은 claims.ts가 막는다(맞힌 특징 없는 찍기는 계정·물건마다 한 번, 틀리면 실패로 센다).
 * - 맞힌 것도 모순도 없어서 실패가 나오면 claims.ts가 실패 대신 근거 부족(NEED_MORE)으로 바꾼다 (10/31).
 * - 색·브랜드가 다른 것은 바로 통과만 막고 실패로 세지 않는다 (10/31 실사용 영상: 연보라를 "분홍", 제품 라인
 *   "Heroine Make"를 제조사 "키스미"로 말한 진짜 주인이 모순 판정으로 잠겼다). 실패는 특징이 틀렸을 때만이다.
 * - 습득물 설명에서 맞힌 특징(storedKey "description")은 맞힌 개수에는 들지만 바로 통과 비율에는 들지 않는다.
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
  const contradictions = comparison.features.filter((f) => f.verdict === "CONTRADICT").length;
  const softContradictions = (comparison.color === "CONTRADICT" ? 1 : 0) + (comparison.brand === "CONTRADICT" ? 1 : 0);

  const storedKeys = new Set(storedFeatures.map((f) => f.key));
  const matchedStored = [...matchedKeys].filter((k) => storedKeys.has(k as AiFeature["key"])).length;
  const ratio = storedKeys.size > 0 ? matchedStored / storedKeys.size : 0;
  if (contradictions === 0 && softContradictions === 0 && matches > 0 && ratio >= PASS_MATCH_RATIO) {
    return { result: "PASS", matches, contradictions, softContradictions, questionFeature: null };
  }

  if (matches === 0 && contradictions > 0) {
    return { result: "FAIL", matches, contradictions, softContradictions, questionFeature: null };
  }

  const mentioned = new Set(reportedKeys);
  const contradicted = new Set(comparison.features.filter((f) => f.verdict === "CONTRADICT").map((f) => f.storedKey));
  const askable = askableFeatures.filter(isAskable);
  const pick = (list: AiFeature[]) =>
    list.find((f) => !mentioned.has(f.key)) ??
    list.find((f) => contradicted.has(f.key)) ??
    list.find((f) => !matchedKeys.has(f.key));
  // 흠집·무늬는 주인도 잘 모른다: 잘 아는 특징에서 먼저 고르고, 없을 때만 묻는다 (10/31 기획 피드백)
  let questionFeature = pick(askable.filter(isMemorable)) ?? pick(askable.filter((f) => !isMemorable(f))) ?? null;
  // 특징은 다 맞혔는데 색·브랜드만 달랐으면 바로 통과 대신 객관식으로 한 번 더 본다(색 질문이 함께 나간다)
  if (!questionFeature && matches > 0 && contradictions === 0 && softContradictions > 0)
    questionFeature = askable.find(isMemorable) ?? askable[0] ?? null;
  if (!questionFeature) {
    // 물어볼 것이 없으면 특징으로만 정한다. 색·브랜드 차이만으로 실패시키지 않는다
    const result = matches > 0 && contradictions === 0 ? "PASS" : "FAIL";
    return { result, matches, contradictions, softContradictions, questionFeature: null };
  }
  return { result: "BORDERLINE", matches, contradictions, softContradictions, questionFeature };
}
