import { createHash } from "node:crypto";
import { type Category, FoundItemExtraction, LostReportExtraction } from "@chajeumpyo/shared";
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
  ["충전", "CHARGER"],
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
    return LostReportExtraction.parse({
      category: guessCategory(description),
      color: null,
      brand: null,
      features: [],
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
