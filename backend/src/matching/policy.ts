// 매칭 정책 값. 회의(open-issues #6~#10)에서 바뀌면 여기만 고친다.

/** 후보 목록에 보여줄 최대 개수 (#6, QA B5: 상위 3개) */
export const CANDIDATE_LIMIT = 3;

/** 습득물 하나당 계정별 실패 허용 횟수 (F-08) */
export const MAX_FAILED_ATTEMPTS = 3;

/** 습득물 하나당 모든 계정 실패 합계 한도. 닿으면 온라인 확인을 막고 대면 확인으로 (#29, open-issues #31) */
export const MAX_ITEM_FAILED_ATTEMPTS = 10;

/**
 * 근거 부족(맞힌 특징도 모순도 없음)은 실패로 세지 않고 특징을 더 적게 한다 (10/31 기획 피드백: 특징을 더 적을수록 횟수만 줄었다).
 * 대신 아무 특징이나 넣어 보며 숨은 특징을 알아내지 못하게 계정·물건마다 이 시간 안에 이 횟수까지만 받는다.
 */
export const NEED_MORE_LIMIT = { count: 3, windowMinutes: 60 } as const;

/** 설명만으로 바로 통과하려면 습득물 특징 중 이 비율 이상이 맞아야 한다(모순 0). 못 미치면 객관식으로 확인한다 (10/30 은열 확정) */
export const PASS_MATCH_RATIO = 0.75;

/**
 * 바로 통과하려면 사진 특징이 이만큼은 있어야 한다. 하나뿐이면 흔한 설명 한 줄로 비율 100%가 된다
 * (10/31 사칭 평가: 특징이 "표면 미세한 흠집" 하나뿐인 흰색 에어팟을 "스크래치 조금 있어요"로 바로 통과). 적으면 늘 객관식으로 확인한다.
 */
export const MIN_FEATURES_FOR_INSTANT_PASS = 2;

/** 누구나 말할 수 있는 특징 종류. 이것만 맞으면 바로 통과하지 않고 객관식으로 확인한다 (10/31 사칭 평가) */
export const GENERIC_FEATURE_KEYS: ReadonlySet<string> = new Set(["scratch", "pattern"]);

/** 다른 종류로 저장돼도 값이 이런 말이면 누구나 말할 수 있는 특징으로 본다 (예: other "모서리 까짐") */
export const GENERIC_FEATURE_WORDS =
  /흠집|스크래치|긁힘|긁힌|기스|찍힘|찍힌|까짐|까진|벗겨|마모|닳|사용감|생활\s*흔적|얼룩|오염|변색/;

/** 후보 고르기 점수 가중치. 합 = 1 (docs/matching-weights.md 시작값) */
export const WEIGHTS = { attr: 0.4, place: 0.3, time: 0.2, emb: 0.1 } as const;

/** 속성 점수 안의 비중 */
export const ATTR_WEIGHTS = { category: 0.6, color: 0.2, brand: 0.2 } as const;

/** 종류 일치 정도 (#10): 정확히 같은 종류가 가장 높다 */
export const CATEGORY_SCORE = { exact: 1, alt: 0.7, related: 0.4, etc: 0.3 } as const;

/** 큰 종류는 같은데 세부 종류가 둘 다 있고 서로 다를 때 (예: 마우스 신고 ↔ 보조배터리). 한쪽이라도 모르면 exact */
export const SUB_CATEGORY_MISMATCH_SCORE = 0.6;

/** 장소: 같은 건물 1, 신고에 건물이 없으면 중간값, 다른 건물 0 (인접 건물 표가 생기면 추가) */
export const PLACE_SCORE = { same: 1, unknown: 0.5, other: 0 } as const;

/** 시간: 분실 구간 끝(lostTo)에서 습득까지 걸린 시간 */
export const TIME_SCORE = [
  { withinHours: 2, score: 1 },
  { withinHours: 24, score: 0.6 },
  { withinHours: 72, score: 0.3 },
] as const;
