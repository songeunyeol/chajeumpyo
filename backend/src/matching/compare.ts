import {
  type AiFeature,
  areNeighborColors,
  Color,
  type FeatureComparison,
  type FeatureVerdict,
} from "@chajeumpyo/shared";
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

/** 값에 일반 낱말 말고 실제 내용이 있는지 */
function hasSpecificValue(feature: AiFeature): boolean {
  return words(feature.value).some((w) => !GENERIC_WORDS.has(compact(w)) && compact(w).length > 0);
}

/**
 * 색은 기본 12색 키로 비교한다. 같으면 일치, 이웃 색(흰색↔회색 등)이면 확인 불가, 그 밖은 모순 (open-issues #24).
 * 12색 키가 아닌 값(옛 데이터 등)은 확인 불가로 본다.
 */
export function compareColor(reported: string | null, stored: string | null): FeatureVerdict {
  const a = Color.safeParse(reported);
  const b = Color.safeParse(stored);
  if (!a.success || !b.success) return "UNKNOWN";
  if (a.data === b.data) return "MATCH";
  if (a.data === "OTHER" || b.data === "OTHER" || areNeighborColors(a.data, b.data)) return "UNKNOWN";
  return "CONTRADICT";
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
