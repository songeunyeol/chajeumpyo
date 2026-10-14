import { createHash } from "node:crypto";
import { type Category, FoundItemExtraction, LostReportExtraction } from "@chajeumpyo/shared";
import { type AiClient, EMBEDDING_DIM } from "./types";

// 고정 계약 형식의 가짜 응답. 같은 입력엔 항상 같은 결과가 나온다.

const KEYWORDS: [string, Category][] = [
  ["이어폰", "EARPHONE"],
  ["에어팟", "EARPHONE"],
  ["충전", "CHARGER"],
  ["배터리", "CHARGER"],
  ["우산", "UMBRELLA"],
  ["학생증", "CARD"],
  ["카드", "CARD"],
  ["지갑", "WALLET"],
  ["텀블러", "TUMBLER"],
  ["필통", "PENCIL_CASE"],
  ["노트북", "LAPTOP_TABLET"],
  ["태블릿", "LAPTOP_TABLET"],
  ["아이패드", "LAPTOP_TABLET"],
  ["가방", "CLOTHING_BAG"],
  ["옷", "CLOTHING_BAG"],
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
};
