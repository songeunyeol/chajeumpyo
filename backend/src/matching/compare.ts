import {
  type AiFeature,
  areNeighborColors,
  Color,
  type FeatureComparison,
  type FeatureVerdict,
} from "@chajeumpyo/shared";
import type { ComparableAttributes } from "../ai/types";
import { compact, looselyContains, stripParticle, words } from "./text";

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
    // 종류를 다르게 부르는 말(이것만 같으면 같은 물건이라 볼 수 없다. 10/29 평가: "파란 안경집"이 "빨간 안경집"과 일치)
    "안경집",
    "커버",
    "덮개",
    "밴드",
    "패치",
    "자수",
    "장식",
    "모양",
    "스크래치",
    "금",
    // 크기·수량 말
    "작은",
    "큰",
    "살짝",
    "여러",
    "개",
    "장",
    "한",
    "두",
    "하나",
    "sticker",
    "scratch",
    "case",
    "keyring",
    // 글자·무늬의 형식만 나타내는 말 (10/31: "Canmake Tokyo 문구"가 저장 "Heroine Make 문구"와 "문구"만 겹쳐 일치로 나왔다)
    "문구",
    "글씨",
    "문자",
    "문양",
    "프린팅",
    "인쇄",
    // 로고·상표의 형식만 나타내는 말 (10/31 검증 1: 사칭 "나이키 로고"가 저장 "MK 로고 모노그램 무늬"와 "로고"만 겹쳐 일치로 나왔다)
    "로고",
    "마크",
    "logo",
    "brand",
    "브랜드",
    "상표",
    "모노그램",
    "monogram",
    "엠블럼",
    "심볼",
  ].map(compact),
);

/**
 * 같은 뜻의 다른 표기를 하나로 (10/29 평가: "빨간색 케이스" ↔ "빨간 안경집", "까만" ↔ "검정").
 * 색·위치 낱말은 WEAK_WORDS로 모아, 그것만 겹친 일치를 가려낸다.
 */
const SYNONYMS: Record<string, string> = {
  빨강: "빨간",
  빨간색: "빨간",
  빨강색: "빨간",
  레드: "빨간",
  파랑: "파란",
  파란색: "파란",
  파랑색: "파란",
  블루: "파란",
  노랑: "노란",
  노란색: "노란",
  노랑색: "노란",
  옐로: "노란",
  검은: "검정",
  검은색: "검정",
  검정색: "검정",
  까만: "검정",
  까만색: "검정",
  블랙: "검정",
  흰: "흰색",
  하얀: "흰색",
  하얀색: "흰색",
  화이트: "흰색",
  초록색: "초록",
  녹색: "초록",
  연두: "초록",
  연두색: "초록",
  그린: "초록",
  분홍색: "분홍",
  핑크: "분홍",
  핑크색: "분홍",
  회색빛: "회색",
  그레이: "회색",
  실버: "은색",
  갈색빛: "갈색",
  브라운: "갈색",
  보라색: "보라",
  퍼플: "보라",
  주황색: "주황",
  오렌지: "주황",
  액정: "화면",
  좌측: "왼쪽",
  우측: "오른쪽",
  상단: "위",
  하단: "아래",
};

/** 약한 낱말: 색과 위치. 다른 내용 없이 이것만 겹치면 우연일 수 있어, 다른 내용이 있으면 그것이 맞아야 일치로 본다 */
const WEAK_WORDS = new Set([
  "빨간",
  "파란",
  "노란",
  "검정",
  "흰색",
  "초록",
  "분홍",
  "회색",
  "은색",
  "갈색",
  "보라",
  "주황",
  "투명",
  "위",
  "아래",
  "앞",
  "뒤",
  "옆",
  "안",
  "안쪽",
  "밖",
  "바깥",
  "앞면",
  "뒷면",
  "옆면",
  "왼쪽",
  "오른쪽",
]);

/**
 * 비교용 낱말: 조사를 떼고 표기를 하나로 맞춘다. 문장부호로 쪼개면 "J.H"가 "j"·"h"로 흩어지므로
 * 띄어쓰기로만 나눈 덩어리(점·하이픈을 지운 "jh")도 함께 넣는다.
 */
function tokens(text: string): string[] {
  const chunks = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => stripParticle(compact(t)));
  return [...new Set([...words(text), ...chunks].map((w) => SYNONYMS[compact(w)] ?? compact(w)).filter(Boolean))];
}

/**
 * 한 물건에 여러 측면이 있을 수 있는 종류. 같은 종류라도 다른 측면을 말하면 모순이 아니라 "말하지 않은 것"으로 본다
 * (10/30 실제 사진 평가: 핸드크림 "흰 뚜껑" ↔ 저장 "튜브형 용기", 볼캡 "흰색 챙" ↔ "데님 원단"이 모순으로 나와 진짜 주인이 떨어졌다).
 * 스티커·흠집·케이스처럼 종류 자체가 대상인 것은 값이 다르면 그대로 모순이다.
 */
const MULTI_ASPECT_KEYS = new Set(["other", "pattern"]);

/** 측면을 나타내는 낱말: 색·위치를 뺀 낱말과, 그 안에 든 일반 낱말("체크무늬"의 "무늬") */
function aspectWords(value: string): Set<string> {
  const out = new Set<string>();
  for (const w of tokens(value)) {
    if (WEAK_WORDS.has(w)) continue;
    out.add(w);
    for (const g of GENERIC_WORDS) if (g.length >= 2 && w !== g && w.includes(g)) out.add(g);
  }
  return out;
}

/** 두 값이 같은 측면(같은 대상)을 말하는지. 겹치는 측면 낱말이 하나라도 있으면 같은 측면이다 */
function sameAspect(a: string, b: string): boolean {
  const bw = aspectWords(b);
  for (const w of aspectWords(a)) if (bw.has(w) || (w.length >= 2 && looselyContains(b, w))) return true;
  return false;
}

/**
 * 없음·부정 표현("흠집 없음", "렌즈가 깨끗해요", "스티커 안 붙어 있어요").
 * 한쪽만 부정이면 낱말이 겹쳐도 같은 특징이 아니다 (10/30 배포 QA: "렌즈 흠집 없음"이 "왼쪽 렌즈 긁힘"과 일치해 바로 통과했다).
 */
const NEGATION = /없|않|아니|깨끗|멀쩡|안\s?(?:붙|달|났|생|보|묻|찍)/;

export function isNegated(value: string): boolean {
  return NEGATION.test(value);
}

/** 값에 일반 낱말 말고 실제 내용이 있는지 */
function hasSpecificValue(feature: AiFeature): boolean {
  return tokens(feature.value).some((w) => !GENERIC_WORDS.has(w));
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

/** 한글·영문 브랜드 표기를 하나로 (10/29 평가: AI가 신고에서 "삼성"·"애플"로 뽑으면 "Samsung"·"Apple"과 모순으로 나왔다) */
const BRAND_ALIASES: Record<string, string> = {
  애플: "apple",
  아이폰: "apple",
  에어팟: "apple",
  맥북: "apple",
  아이패드: "apple",
  삼성: "samsung",
  갤럭시: "samsung",
  삼성전자: "samsung",
  엘지: "lg",
  lg전자: "lg",
  현대: "hyundai",
  기아: "kia",
  스탠리: "stanley",
  소니: "sony",
  나이키: "nike",
  아디다스: "adidas",
  샤오미: "xiaomi",
  다이슨: "dyson",
  보스: "bose",
  로지텍: "logitech",
  레노버: "lenovo",
  에이수스: "asus",
  // 10/31 실사용 영상: 주인은 "키스미"로 아는데 저장 브랜드는 제품 라인 "Heroine Make"였다
  키스미: "kissme",
  히로인메이크: "heroinemake",
  캔메이크: "canmake",
  케이트: "kate",
  이니스프리: "innisfree",
  롬앤: "romand",
  클리오: "clio",
};
const BRAND_NAMES = [...new Set(Object.values(BRAND_ALIASES))];
/** "삼성 갤럭시북"·"Samsung Galaxy"처럼 모델명이 붙어도 브랜드만 꺼낸다 */
function brandKey(b: string): string {
  const c = compact(b);
  const alias = Object.keys(BRAND_ALIASES).find((k) => c.includes(compact(k)));
  if (alias) return BRAND_ALIASES[alias] as string;
  return BRAND_NAMES.find((name) => c.includes(name)) ?? c;
}

/** 영문 두 단어 이상 브랜드의 머리글자 ("MICHAEL KORS" → "mk"). 한 단어면 null */
function brandInitials(b: string): string | null {
  const words = b
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words.length >= 2 ? words.map((w) => w[0]).join("") : null;
}

const HANGUL = /[가-힣]/;
const LATIN = /[a-z]/i;

/**
 * 브랜드 대조. context는 습득물 설명(비공개)으로, 제조사·한글 읽기가 거기에만 적힌 경우를 잡는다
 * (10/31 실사용 영상: 저장 "Heroine Make", 설명 "키스미 히로인메이크 아이라이너", 주인 "키스미" → 모순으로 잠겼다).
 * 한글과 영문처럼 표기가 다르면 규칙으로는 같은지 알 수 없어 모순 대신 확인 불가로 둔다(AI가 다시 본다).
 */
export function compareBrand(
  reported: string | null,
  stored: string | null,
  context: string | null = null,
): FeatureVerdict {
  if (!reported || !stored) return "UNKNOWN";
  if (brandKey(reported) === brandKey(stored) || looselyContains(reported, stored)) return "MATCH";
  // 줄임말 (실제 사진 35장 평가 10/30: 저장 "MICHAEL KORS" ↔ 신고 "MK"가 모순으로 나왔다)
  const r = compact(reported);
  const st = compact(stored);
  if (r.length >= 2 && (brandInitials(stored) === r || brandInitials(reported) === st)) return "MATCH";
  if (context && r.length >= 2) {
    const c = compact(context);
    if (c.includes(r) || c.includes(brandKey(reported))) return "MATCH";
  }
  const crossScript =
    (HANGUL.test(reported) && !LATIN.test(reported) && LATIN.test(stored) && !HANGUL.test(stored)) ||
    (LATIN.test(reported) && !HANGUL.test(reported) && HANGUL.test(stored) && !LATIN.test(stored));
  if (crossScript) return "UNKNOWN";
  return "CONTRADICT";
}

/** 저장 설명에 낱말이 있는지. 끝 글자 하나(임·함·이)를 뗀 꼴도 본다("갈색뚜껑임" ↔ "갈색 뚜껑이") */
function inText(textCompact: string, word: string): boolean {
  if (word.length < 2) return false;
  if (textCompact.includes(word)) return true;
  return word.length >= 3 && textCompact.includes(word.slice(0, -1));
}

/**
 * 신고 특징이 습득물 설명(비공개)에 실제로 적혀 있는지.
 * 물건 이름 한 낱말("아이라이너")만 겹친 것은 근거로 보지 않는다: 서로 다른 내용 낱말 두 개 이상이 겹치거나,
 * 색·위치와 붙어 쓴 낱말("갈색뚜껑")이 겹쳐야 한다. "흠집 없음"처럼 부정으로 말한 특징은 설명으로 맞히지 않는다.
 */
export function descriptionSupports(value: string, description: string | null | undefined): boolean {
  if (!description || isNegated(value)) return false;
  const text = compact(description);
  const hits = new Set<string>();
  let compound = false;
  for (const raw of value.toLowerCase().split(/\s+/)) {
    const chunk = stripParticle(compact(raw));
    if (!chunk || GENERIC_WORDS.has(chunk) || !inText(text, chunk)) continue;
    hits.add(SYNONYMS[chunk] ?? chunk);
    if ([...WEAK_WORDS].some((w) => chunk.startsWith(w) && chunk.length > w.length + 1)) compound = true;
  }
  const strong = [...hits].some((w) => !WEAK_WORDS.has(w));
  return strong && (hits.size >= 2 || compound);
}

/**
 * 신고 특징 하나를 저장 특징과 비교한다.
 * 일치는 종류(key)를 가리지 않는다: 같은 장식을 습득자 사진은 "무늬"로, 신고 설명은 "기타"로 나눠 담는 일이 있어서
 * 똑같은 문장을 적어도 실패했다 (10/29 운영, 안경 "양쪽 프레임 끝 두 개의 점 장식"). 같은 종류를 먼저 본다.
 * 모순은 같은 종류의 저장 특징이 있는데 내용이 다를 때만이다.
 */
function compareFeature(
  reported: AiFeature,
  stored: AiFeature[],
  description: string | null = null,
): FeatureComparison["features"][number] {
  if (!hasSpecificValue(reported)) return { reportedKey: reported.key, verdict: "UNKNOWN", storedKey: null };
  // 일반 낱말을 뺀 내용 낱말이 저장 값에 들어 있으면 일치.
  // 2글자 이상은 저장 값 안에 들어 있으면, 1글자("별", "점")는 저장 값에 같은 낱말이 있을 때만.
  // 색·위치 말고 다른 내용이 있으면 색·위치만 겹친 것은 일치로 보지 않는다 ("빨간 하트 키링" ↔ "빨간 케이스").
  const content = tokens(reported.value).filter((w) => !GENERIC_WORDS.has(w));
  const hasStrong = content.some((w) => !WEAK_WORDS.has(w));
  const matches = (s: AiFeature) => {
    const storedTokens = new Set(tokens(s.value));
    const hits = content.filter((w) => storedTokens.has(w) || (w.length >= 2 && looselyContains(s.value, w)));
    if (isNegated(reported.value) !== isNegated(s.value)) return false;
    return hits.length > 0 && (!hasStrong || hits.some((w) => !WEAK_WORDS.has(w)));
  };
  const sameKey = stored.filter((s) => s.key === reported.key);
  const hit = sameKey.find(matches) ?? stored.find(matches);
  if (hit) return { reportedKey: reported.key, verdict: "MATCH", storedKey: hit.key };
  // 특징 목록에는 없지만 습득물 설명에 적힌 것("갈색 뚜껑"). storedKey "description"은 바로 통과 비율에 넣지 않는다
  if (descriptionSupports(reported.value, description))
    return { reportedKey: reported.key, verdict: "MATCH", storedKey: DESCRIPTION_KEY };
  // 여러 측면이 있는 종류는 같은 측면을 말한 저장 특징과만 견준다
  const rivals = MULTI_ASPECT_KEYS.has(reported.key)
    ? sameKey.filter((s) => sameAspect(reported.value, s.value))
    : sameKey;
  // 다른 측면이면 모름. 저장 특징 종류는 남겨, AI가 같은 뜻인지 다시 볼 수 있게 한다("모눈 칸" ↔ "격자 무늬")
  if (rivals.length === 0) return { reportedKey: reported.key, verdict: "UNKNOWN", storedKey: sameKey[0]?.key ?? null };
  return { reportedKey: reported.key, verdict: "CONTRADICT", storedKey: rivals[0]?.key ?? null };
}

/** 습득물 설명에서 맞힌 특징의 storedKey. 저장 특징 종류가 아니라서 바로 통과 비율에는 들어가지 않는다 */
export const DESCRIPTION_KEY = "description";

export function compareByRules(reported: ComparableAttributes, stored: ComparableAttributes): FeatureComparison {
  const description = stored.description ?? null;
  return {
    features: reported.features.map((f) => compareFeature(f, stored.features, description)),
    color: compareColor(reported.color, stored.color),
    brand: compareBrand(reported.brand, stored.brand, description),
  };
}
