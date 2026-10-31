import type { AiFeature } from "@chajeumpyo/shared";
import { GENERIC_FEATURE_KEYS, GENERIC_FEATURE_WORDS } from "./policy";

/**
 * 확인 질문 문구 (F-09). 한두 단어로 답할 수 있는 특징만 고른다.
 * 질문에는 특징의 종류만 드러나고 값은 드러나지 않는다. 물건 이름을 앞에 붙여 무엇을 떠올리면 되는지 이끈다.
 */
const TEMPLATES: Record<string, string> = {
  sticker: "에 붙어 있는 스티커는 어떤 그림이나 글자인가요?",
  keyring: "에 달려 있는 키링은 어떤 모양인가요?",
  text: "에 적혀 있는 글자는 무엇인가요?",
  engraving: "에 새겨진 글자는 무엇인가요?",
  case: "의 케이스는 어떤 색이나 무늬인가요?",
  scratch: "의 흠집은 어느 쪽에 있나요?",
  contents: " 안에 들어 있던 물건은 무엇인가요?",
  pattern: "에 있는 무늬나 장식은 어떤 모양인가요?",
  other: "에서 눈에 띄는 다른 특징은 무엇인가요?",
};

/** 질문할 수 있는 특징인지 */
export function isAskable(feature: AiFeature): boolean {
  return feature.key in TEMPLATES;
}

/**
 * 오래 써도 주인이 잘 모르는 특징 (10/31 기획 피드백: 흠집 위치·무늬는 진짜 주인도 틀렸다).
 * 색·스티커·키링·케이스·각인처럼 확실히 아는 특징이 없을 때만 묻는다.
 */
const HARD_TO_REMEMBER = new Set(["scratch", "pattern"]);

export function isMemorable(feature: AiFeature): boolean {
  return !HARD_TO_REMEMBER.has(feature.key);
}

/** 흐린 썸네일로도 짐작할 수 있는 큰 특징: 몸통·뚜껑 같은 큰 부분의 색, 전체 모양, 무늬 */
const THUMBNAIL_WORDS =
  /색|빨간|빨강|파란|파랑|노란|노랑|초록|검정|검은|까만|흰|하얀|회색|갈색|분홍|보라|하늘|베이지|남색|투명|은색|금색|모양|형태|실루엣|생김새/;
/** 이름·글자처럼 썸네일로는 읽을 수 없는 값 (영문·숫자가 섞이면 글자를 가리킨다) */
const READABLE_DETAIL = /[A-Za-z0-9]/;

/**
 * 흐린 썸네일로 짐작할 수 있는 특징 (10/31 사칭 평가: 썸네일을 본 사칭이 핸드크림 뚜껑 색·키링 "강아지 모양"으로 통과).
 * 찍기 객관식(맞힌 특징 0)에서는 이것을 빼지 않고 뒤로 미룬다: 스티커·키링·글자·각인처럼 작은 부분을 먼저 묻고,
 * 질문 수가 모자랄 때만 쓴다. 다 빼면 특징이 적은 물건(필통·노트·파우치)의 주인이 근거 부족에 갇힌다 (11/1 주인 평가 68→42/79).
 */
export function isThumbnailVisible(feature: AiFeature): boolean {
  if (feature.key === "pattern") return true;
  if (feature.key !== "case" && feature.key !== "other") return false;
  return THUMBNAIL_WORDS.test(feature.value) && !READABLE_DETAIL.test(feature.value);
}

/**
 * 재질·구조만 말하는 특징("가죽 질감", "지퍼 포켓 위치"). 지갑이면 가죽, 필통이면 지퍼처럼 종류만 알아도 말할 수 있다 (10/31 검증 2).
 * 색·글자·숫자가 섞이면 구체적인 특징으로 본다.
 */
const STRUCTURE_WORDS =
  /질감|재질|소재|가죽|패브릭|플라스틱|금속|지퍼|포켓|수납|카드\s*칸|버클|클립|버튼|박음질|스티치/;
const SPECIFIC_DETAIL =
  /[A-Za-z0-9]|색|빨간|파란|노란|검정|검은|까만|흰|하얀|회색|갈색|분홍|보라|하늘|베이지|남색|은색|금색/;

function isStructureOnly(feature: AiFeature): boolean {
  return STRUCTURE_WORDS.test(feature.value) && !SPECIFIC_DETAIL.test(feature.value);
}

/** 흠집·무늬·사용감처럼 그 물건을 보지 않은 사람도 말할 수 있는 특징. 이것만 맞으면 바로 통과하지 않는다 (10/31 사칭 평가) */
export function isGenericFeature(feature: AiFeature): boolean {
  return GENERIC_FEATURE_KEYS.has(feature.key) || GENERIC_FEATURE_WORDS.test(feature.value) || isStructureOnly(feature);
}

/** 사진 글자 인식에서 흔히 나오는 조각 (10/31: 락앤락 텀블러 로고를 "is"로 읽었다) */
const STOP_FRAGMENTS = new Set([
  "is",
  "in",
  "on",
  "as",
  "at",
  "of",
  "to",
  "by",
  "an",
  "a",
  "it",
  "be",
  "or",
  "the",
  "and",
  "for",
]);

/**
 * 믿을 수 없는 글자 조각 (10/31 검증 1·실사진 평가: "is 로고 글자"와 대조해 "locknlock 글씨"라고 적은 진짜 주인이 실패).
 * 영어 기능어 조각은 늘, 3글자 이하는 습득물 설명에 없을 때만 버린다(설명에도 있으면 "KGB" 이니셜처럼 진짜 글자일 수 있다).
 * 버린 특징은 대조·질문·바로 통과 비율 어디에도 쓰지 않는다.
 */
export function isUntrustedFragment(feature: AiFeature, description: string | null | undefined): boolean {
  if (feature.key !== "text") return false;
  // 읽은 글자는 영문·숫자 덩어리로 본다("하단 is 로고 문구" → is). 한글로만 된 값(아이패드 글자)은 그대로 둔다
  const latin = feature.value.match(/[A-Za-z0-9&]+/g) ?? [];
  if (latin.length === 0) return false;
  if (latin.every((p) => STOP_FRAGMENTS.has(p.toLowerCase()))) return true;
  const letters = latin.join("");
  if (letters.length > 3) return false;
  // 점으로 나눈 이니셜("J.H")은 사진 조각이 아니라 각인·이니셜로 본다
  if (/\b[A-Za-z](?:\.[A-Za-z])+\.?/.test(feature.value)) return false;
  return !(description ?? "").toLowerCase().includes(letters.toLowerCase());
}

/**
 * 묻기 어려운 작은 글자 (10/31 검증 2: 안경다리 안쪽 "kkeulle made in korea"). 바깥에 크게 보이는 글자·로고만 묻는다.
 * 대조에는 쓰지만 질문과 바로 통과 비율에서는 뺀다.
 */
const INNER_TEXT =
  /made\s*in|제조|원산지|모델|사이즈|size|\b[a-z]{1,3}-?\d{2,}\b|\d+\s*(?:mm|cm|ml|g)\b|다리\s*안|라벨|택\b|tag/i;

export function isInnerText(feature: AiFeature): boolean {
  if (feature.key !== "text" && feature.key !== "other") return false;
  return INNER_TEXT.test(feature.value);
}

/**
 * 종류만 알아도 맞히는 제품 이름·브랜드 (11/1 사칭 평가: 검정 태블릿 사칭이 "아이패드 (iPad)" 글자·"Apple" 브랜드 질문을 찍어서 통과).
 * 이 낱말이 정답인 글자·브랜드 질문은 내지 않는다. 대조(주인이 적은 "에어팟"이 맞는지)에는 그대로 쓴다.
 */
const OBVIOUS_PRODUCT_WORDS: Partial<Record<string, string[]>> = {
  PHONE: ["iphone", "아이폰", "galaxy", "갤럭시", "apple", "애플", "samsung", "삼성"],
  EARPHONE: ["airpods", "airpod", "에어팟", "galaxybuds", "버즈", "apple", "애플"],
  SMARTWATCH: ["applewatch", "애플워치", "galaxywatch", "갤럭시워치", "apple", "애플"],
  TABLET: ["ipad", "아이패드", "galaxytab", "갤럭시탭", "apple", "애플"],
  LAPTOP: ["macbook", "맥북", "apple", "애플"],
};

const compact = (t: string) => t.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

/** 정답(글자·브랜드 값)이 그 종류의 대표 제품 이름·브랜드라 종류만 알아도 맞힐 수 있는지 */
export function isObviousForCategory(value: string | null | undefined, category: string | null | undefined): boolean {
  const words = category ? OBVIOUS_PRODUCT_WORDS[category] : undefined;
  if (!words || !value) return false;
  const v = compact(value);
  return words.some((w) => v.includes(w));
}

/** 질문으로 내도 되는 특징: 질문 문구가 있고, 작은 안쪽 글자·재질·구조 같은 종류만으로 알 수 있는 것이 아닌 것 */
export function isQuizable(feature: AiFeature): boolean {
  return isAskable(feature) && !isInnerText(feature) && !isStructureOnly(feature);
}

/** 위치만 다른 보기(상단/하단/중앙/측면). 주인도 헷갈려 뒤로 미룬다 (10/31 검증 2) */
const POSITION_WORDS =
  /상단|하단|중앙|측면|왼쪽|오른쪽|위쪽|아래쪽|앞면|뒷면|옆면|윗면|밑면|가운데|모서리|안쪽|바깥쪽|위|아래|앞|뒤|옆|쪽|좌측|우측/g;

export function isPositionOnly(options: string[]): boolean {
  const stripped = options.map((o) => o.replace(POSITION_WORDS, "").replace(/\s+/g, "").trim());
  return stripped.every((s) => s === stripped[0]);
}

/** itemName: 물건 이름(예: "안경·선글라스"). 가운뎃점 앞만 쓴다("이 안경에 ..."). 없으면 "이 물건" */
export function questionFor(feature: AiFeature, itemName?: string | null): string {
  const tail = TEMPLATES[feature.key];
  if (!tail) return "물건의 특징을 한두 단어로 알려 주세요.";
  return `이 ${itemName?.split("·")[0]?.trim() || "물건"}${tail}`;
}

/**
 * 객관식 오답 보기 (AI가 보기를 못 만들 때 쓴다). 다른 습득물의 특징은 쓰지 않는다(그 물건의 숨은 특징이 새지 않게).
 * 정답과 겹치는 보기는 고를 때 뺀다.
 */
export const PRESET_DISTRACTORS: Record<string, string[]> = {
  sticker: ["곰돌이 캐릭터 스티커", "학교 로고 스티커", "하트 모양 스티커", "영문 글자 스티커", "별 모양 스티커"],
  keyring: ["곰 인형 키링", "하트 모양 금속 키링", "캐릭터 고무 키링", "방울 달린 키링", "별 모양 아크릴 키링"],
  text: ["영문 이니셜", "전화번호 뒷자리", "학번 숫자", "한글 이름", "짧은 영어 문구"],
  engraving: ["영문 이니셜", "날짜 숫자", "하트 모양", "한글 이름", "짧은 영어 문장"],
  case: ["투명 젤리 케이스", "검정 가죽 케이스", "분홍 실리콘 케이스", "체크 무늬 케이스", "카드 수납 케이스"],
  scratch: ["왼쪽 위 모서리", "오른쪽 아래 모서리", "뒷면 가운데", "옆면 버튼 근처", "앞면 위쪽"],
  contents: ["교통카드 한 장", "현금과 영수증", "학생증과 카드 두 장", "립밤과 이어폰", "열쇠 하나"],
  pattern: ["체크 무늬", "줄무늬", "꽃무늬 장식", "금속 로고 장식", "작은 별 무늬"],
  brand: [
    "Samsung",
    "Sony",
    "Xiaomi",
    "Nike",
    "Adidas",
    "삼성 (Samsung)",
    "애플 (Apple)",
    "소니 (Sony)",
    "샤오미 (Xiaomi)",
    "나이키 (Nike)",
  ],
  other: [
    "이름 라벨이 붙어 있음",
    "모서리가 찌그러짐",
    "작은 배지가 달려 있음",
    "손잡이에 테이프를 감음",
    "끈이 달려 있음",
  ],
};

/** 브랜드 질문 문구. 특징이 적은 물건의 객관식에서 흠집 대신 묻는다 (10/31 사칭 평가) */
export function brandQuestionFor(itemName?: string | null): string {
  return `이 ${itemName?.split("·")[0]?.trim() || "물건"}의 브랜드는 무엇인가요?`;
}

/** 색 질문 문구 */
export function colorQuestionFor(itemName?: string | null): string {
  return `이 ${itemName?.split("·")[0]?.trim() || "물건"}은 무슨 색인가요?`;
}
