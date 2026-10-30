// 매칭 정책 값. 회의(open-issues #6~#10)에서 바뀌면 여기만 고친다.

/** 후보 목록에 보여줄 최대 개수 (#6, QA B5: 상위 3개) */
export const CANDIDATE_LIMIT = 3;

/** 습득물 하나당 계정별 실패 허용 횟수 (F-08) */
export const MAX_FAILED_ATTEMPTS = 3;

/** 습득물 하나당 모든 계정 실패 합계 한도. 닿으면 온라인 확인을 막고 대면 확인으로 (#29, open-issues #31) */
export const MAX_ITEM_FAILED_ATTEMPTS = 10;

/** 설명만으로 바로 통과하려면 습득물 특징 중 이 비율 이상이 맞아야 한다(모순 0). 못 미치면 객관식으로 확인한다 (10/30 은열 확정) */
export const PASS_MATCH_RATIO = 0.75;

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
