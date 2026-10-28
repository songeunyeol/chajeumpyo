import { createHash } from "node:crypto";
import {
  type AiFeature,
  type Category,
  type Color,
  type FeatureKey,
  FoundItemExtraction,
  LostReportExtraction,
  MAX_FEATURES,
  type SubCategory,
  subCategoryWithin,
} from "@chajeumpyo/shared";
import { compareByRules } from "../matching/compare";
import { rawWords, sameWord } from "../matching/text";
import { type AiClient, EMBEDDING_DIM } from "./types";

// 고정 계약 형식의 가짜 응답. 같은 입력엔 항상 같은 결과가 나온다.

// 먼저 맞는 낱말이 이긴다. 겹치는 낱말은 긴 쪽을 앞에 둔다 (이어폰 > 폰, 교통카드 > 카드, 스마트워치 > 시계)
const KEYWORDS: [string, Category][] = [
  ["이어폰", "EARPHONE"],
  ["에어팟", "EARPHONE"],
  ["버즈", "EARPHONE"],
  ["스마트워치", "SMARTWATCH"],
  ["애플워치", "SMARTWATCH"],
  ["갤럭시워치", "SMARTWATCH"],
  ["헤드폰", "EARPHONE"],
  ["충전", "CHARGER"],
  ["보조배터리", "CHARGER"],
  ["키보드", "CHARGER"],
  ["배터리", "CHARGER"],
  ["마우스", "CHARGER"],
  ["휴대폰", "PHONE"],
  ["핸드폰", "PHONE"],
  ["아이폰", "PHONE"],
  ["갤럭시", "PHONE"],
  ["학생증", "ID_CARD"],
  ["신분증", "ID_CARD"],
  ["면허증", "DRIVER_LICENSE"],
  ["교통카드", "TRANSIT_CARD"],
  ["체크카드", "PAYMENT_CARD"],
  ["신용카드", "PAYMENT_CARD"],
  ["카드", "OTHER_CARD"],
  ["지갑", "WALLET"],
  ["현금", "CASH"],
  ["태블릿", "TABLET"],
  ["아이패드", "TABLET"],
  ["노트북", "LAPTOP"],
  ["맥북", "LAPTOP"],
  ["가방", "BAG"],
  ["백팩", "BAG"],
  ["모자", "HAT"],
  ["후드", "CLOTHING"],
  ["패딩", "CLOTHING"],
  ["옷", "CLOTHING"],
  ["교재", "BOOK"],
  ["책", "BOOK"],
  ["안경", "GLASSES"],
  ["선글라스", "GLASSES"],
  ["시계", "ACCESSORY"],
  ["반지", "ACCESSORY"],
  ["목걸이", "ACCESSORY"],
  ["귀걸이", "ACCESSORY"],
  ["우산", "UMBRELLA"],
  ["텀블러", "TUMBLER"],
  ["물병", "TUMBLER"],
  ["열쇠", "KEY"],
  ["차 키", "KEY"],
  ["차키", "KEY"],
  ["필통", "STATIONERY"],
  ["볼펜", "STATIONERY"],
  ["샤프", "STATIONERY"],
];

function guessCategory(text: string): Category {
  return KEYWORDS.find(([k]) => text.includes(k))?.[1] ?? "ETC";
}

const COLOR_WORDS: [string, Color][] = [
  ["흰", "WHITE"],
  ["하얀", "WHITE"],
  ["화이트", "WHITE"],
  ["검정", "BLACK"],
  ["검은", "BLACK"],
  ["블랙", "BLACK"],
  ["회색", "GRAY_SILVER"],
  ["은색", "GRAY_SILVER"],
  ["실버", "GRAY_SILVER"],
  ["빨간", "RED"],
  ["빨강", "RED"],
  ["주황", "ORANGE_CORAL"],
  ["노란", "YELLOW"],
  ["노랑", "YELLOW"],
  ["초록", "GREEN"],
  ["녹색", "GREEN"],
  ["파란", "BLUE_TEAL"],
  ["파랑", "BLUE_TEAL"],
  ["남색", "BLUE_TEAL"],
  ["보라", "PURPLE"],
  ["분홍", "PINK_MAGENTA"],
  ["핑크", "PINK_MAGENTA"],
  ["갈색", "BROWN"],
  ["브라운", "BROWN"],
];

function guessColor(text: string): Color | null {
  return COLOR_WORDS.find(([w]) => text.includes(w))?.[1] ?? null;
}

const FEATURE_WORDS: [string, FeatureKey][] = [
  ["스티커", "sticker"],
  ["긁힘", "scratch"],
  ["흠집", "scratch"],
  ["찍힘", "scratch"],
  ["찌그러", "scratch"],
  ["케이스", "case"],
  ["커버", "case"],
  ["키링", "keyring"],
  ["고리", "keyring"],
  ["각인", "text"],
  ["이니셜", "text"],
  ["이름", "text"],
  ["무늬", "pattern"],
  ["그림", "pattern"],
];

/** 세부 종류 낱말. 큰 종류에 속하지 않으면 버린다(subCategoryWithin) */
const SUB_KEYWORDS: [string, SubCategory][] = [
  ["에어팟", "WIRELESS_EARBUDS"],
  ["버즈", "WIRELESS_EARBUDS"],
  ["무선 이어폰", "WIRELESS_EARBUDS"],
  ["유선 이어폰", "WIRED_EARPHONE"],
  ["헤드폰", "HEADPHONE"],
  ["마우스", "MOUSE"],
  ["키보드", "KEYBOARD"],
  ["보조배터리", "POWER_BANK"],
  ["충전기", "CABLE_CHARGER"],
  ["케이블", "CABLE_CHARGER"],
  ["백팩", "BACKPACK"],
  ["에코백", "ECO_BAG"],
  ["파우치", "POUCH"],
  ["장지갑", "LONG_WALLET"],
  ["반지갑", "BIFOLD_WALLET"],
  ["카드지갑", "CARD_WALLET"],
  ["패딩", "OUTER"],
  ["코트", "OUTER"],
  ["필통", "PENCIL_CASE"],
  ["계산기", "CALCULATOR"],
  ["전공책", "TEXTBOOK"],
  ["노트", "NOTEBOOK"],
];

function guessSubCategory(text: string, category: Category): SubCategory | null {
  const hit = SUB_KEYWORDS.find(([w]) => text.includes(w));
  return subCategoryWithin(category, hit?.[1]);
}

/**
 * 설명을 쉼표·마침표로 나눠, 특징 낱말이 든 구절을 특징으로 본다. 구절에 낱말이 여럿이면 뒤에 나온 것
 * (예: "케이스에 곰돌이 스티커" → sticker). 키 없이 개발할 때도 확인 통과까지 흘려 보기 위한 흉내다.
 */
function guessFeatures(text: string): AiFeature[] {
  const out: AiFeature[] = [];
  for (const phrase of text.split(/[,.·\n]/).map((p) => p.trim())) {
    let best: { key: FeatureKey; at: number } | null = null;
    for (const [w, key] of FEATURE_WORDS) {
      const at = phrase.lastIndexOf(w);
      if (at >= 0 && (!best || at > best.at)) best = { key, at };
    }
    if (best && phrase.length <= 40) out.push({ key: best.key, value: phrase });
  }
  return out.slice(0, MAX_FEATURES);
}

/** 텍스트 해시로 만든 단위 벡터. 같은 텍스트면 유사도 1. */
function hashEmbedding(text: string): number[] {
  const out: number[] = [];
  let block = createHash("sha256").update(text).digest();
  while (out.length < EMBEDDING_DIM) {
    for (const byte of block) {
      if (out.length >= EMBEDDING_DIM) break;
      out.push(byte / 127.5 - 1);
    }
    block = createHash("sha256").update(block).digest();
  }
  const norm = Math.hypot(...out);
  return out.map((v) => v / norm);
}

export const mockAiClient: AiClient = {
  async extractFoundItem() {
    return FoundItemExtraction.parse({
      hasObject: true,
      category: "EARPHONE",
      categoryAlt: "CHARGER",
      subCategory: "WIRELESS_EARBUDS",
      color: "WHITE",
      brand: "Apple",
      features: [
        { key: "sticker", value: "곰돌이 스티커" },
        { key: "scratch", value: "오른쪽 아래 긁힘" },
      ],
      description: "흰색 애플 무선 이어폰 케이스, 곰돌이 스티커와 오른쪽 아래 긁힘이 있다.",
      isSensitive: false,
      sensitiveRegions: [],
      title: "흰색 무선 이어폰, 곰돌이 스티커",
    });
  },

  async extractLostReport(description) {
    const category = guessCategory(description);
    return LostReportExtraction.parse({
      category,
      subCategory: guessSubCategory(description, category),
      color: guessColor(description),
      brand: null,
      features: guessFeatures(description),
      description,
    });
  },

  async embed(text) {
    return hashEmbedding(text);
  },

  async compareFeatures(reported, stored) {
    return compareByRules(reported, stored);
  },

  /** 규칙으로 못 가린 답: 답의 낱말이 모두 저장 값의 낱말과 같을 때만 MATCH (1글자 답도 여기서 판단) */
  async judgeAnswer({ stored, answer }) {
    const storedWords = rawWords(stored);
    const answerWords = rawWords(answer);
    return answerWords.length > 0 && answerWords.every((w) => storedWords.some((s) => sameWord(w, s) !== null))
      ? "MATCH"
      : "NO_MATCH";
  },
};
