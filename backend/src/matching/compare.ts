import type { AiFeature, FeatureComparison, FeatureVerdict } from "@chajeumpyo/shared";
import type { ComparableAttributes } from "../ai/types";
import { compact, looselyContains, words } from "./text";

// 규칙 기반 특징 대조. mock AI가 쓰고, 실제 AI 구현에서도 1차 판단으로 쓸 수 있다.

/** 특징 종류만 나타내는 일반 낱말. 이것만 적으면 값을 적지 않은 것으로 본다 (open-issues #7). */
const GENERIC_WORDS = new Set(
  [
    "스티커",
    "흠집",
    "긁힘",
    "기스",
    "자국",
    "케이스",
    "키링",
    "고리",
    "글자",
    "이름",
    "각인",
    "무늬",
    "그림",
    "내용물",
    "안에",
    "있음",
    "있어요",
    "있다",
    "붙어",
    "붙음",
    "달림",
    "달려",
    "색",
    "색깔",
    "sticker",
    "scratch",
    "case",
    "keyring",
  ].map(compact),
);

/** 비슷해서 모순으로 보지 않는 색 묶음 (open-issues #24) */
const SIMILAR_COLORS: string[][] = [
  ["흰", "화이트", "하양", "아이보리", "크림", "white", "ivory"],
  ["검정", "검은", "블랙", "black", "남색", "네이비", "진회색"],
  ["회색", "그레이", "실버", "은색", "gray", "grey", "silver"],
  ["빨강", "빨간", "레드", "red", "분홍", "핑크", "pink", "자주"],
  ["파랑", "파란", "블루", "blue", "하늘", "남색", "네이비"],
  ["노랑", "노란", "옐로", "yellow", "금색", "골드", "베이지"],
  ["초록", "녹색", "그린", "green", "민트", "카키"],
  ["갈색", "브라운", "brown", "베이지", "카키"],
];

/** 값에 일반 낱말 말고 실제 내용이 있는지 */
function hasSpecificValue(feature: AiFeature): boolean {
  return words(feature.value).some((w) => !GENERIC_WORDS.has(compact(w)) && compact(w).length > 0);
}

function colorGroup(color: string): number[] {
  const c = compact(color);
  return SIMILAR_COLORS.flatMap((group, i) => (group.some((g) => c.includes(compact(g))) ? [i] : []));
}

export function compareColor(reported: string | null, stored: string | null): FeatureVerdict {
  if (!reported || !stored) return "UNKNOWN";
  if (looselyContains(reported, stored)) return "MATCH";
  const a = colorGroup(reported);
  const b = colorGroup(stored);
  if (a.length === 0 || b.length === 0) return "UNKNOWN";
  return a.some((g) => b.includes(g)) ? "UNKNOWN" : "CONTRADICT";
}

export function compareBrand(reported: string | null, stored: string | null): FeatureVerdict {
  if (!reported || !stored) return "UNKNOWN";
  return looselyContains(reported, stored) ? "MATCH" : "CONTRADICT";
}

/** 신고 특징 하나를 같은 종류(key)의 저장 특징과 비교 */
function compareFeature(reported: AiFeature, stored: AiFeature[]): FeatureComparison["features"][number] {
  const sameKey = stored.filter((s) => s.key === reported.key);
  if (sameKey.length === 0 || !hasSpecificValue(reported)) {
    return { reportedKey: reported.key, verdict: "UNKNOWN", storedKey: null };
  }
  // 일반 낱말을 뺀 내용 낱말이 저장 값에 들어 있으면 일치
  const content = words(reported.value).filter((w) => !GENERIC_WORDS.has(compact(w)));
  const hit = sameKey.find((s) => content.some((w) => compact(w).length >= 2 && looselyContains(s.value, w)));
  if (hit) return { reportedKey: reported.key, verdict: "MATCH", storedKey: hit.key };
  return { reportedKey: reported.key, verdict: "CONTRADICT", storedKey: sameKey[0]?.key ?? null };
}

export function compareByRules(reported: ComparableAttributes, stored: ComparableAttributes): FeatureComparison {
  return {
    features: reported.features.map((f) => compareFeature(f, stored.features)),
    color: compareColor(reported.color, stored.color),
    brand: compareBrand(reported.brand, stored.brand),
  };
}
