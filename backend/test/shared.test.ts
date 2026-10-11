import { Category, FoundItemExtraction, relatedCategories } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { mockAiClient } from "../src/ai/mock";
import { EMBEDDING_DIM } from "../src/ai/types";

describe("relatedCategories", () => {
  it("자기 자신, 연관 종류, ETC를 포함한다", () => {
    expect(relatedCategories("EARPHONE")).toEqual(["EARPHONE", "CHARGER", "ETC"]);
  });

  it("묶음이 없는 종류도 ETC는 함께 찾는다", () => {
    expect(relatedCategories("UMBRELLA")).toEqual(["UMBRELLA", "ETC"]);
  });

  it("ETC는 모든 종류와 묶인다", () => {
    expect(relatedCategories("ETC")).toEqual(Category.options);
  });
});

describe("mockAiClient", () => {
  it("습득물 분석 결과가 고정 계약 형식을 따른다", async () => {
    const result = await mockAiClient.extractFoundItem(Buffer.from(""), "image/jpeg");
    expect(FoundItemExtraction.safeParse(result).success).toBe(true);
  });

  it("임베딩은 정해진 차원의 단위 벡터이고 같은 입력엔 같은 값", async () => {
    const a = await mockAiClient.embed("흰색 에어팟");
    expect(a).toHaveLength(EMBEDDING_DIM);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect(await mockAiClient.embed("흰색 에어팟")).toEqual(a);
  });
});
