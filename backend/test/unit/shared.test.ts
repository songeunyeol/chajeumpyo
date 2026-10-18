import { Category, FoundItemExtraction, relatedCategories } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { mockAiClient } from "../../src/ai/mock";
import { EMBEDDING_DIM } from "../../src/ai/types";

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

describe("mockAiClient 분실 신고 분석 (키 없이 개발할 때 확인 통과까지 흘려 보기)", () => {
  it("색과 특징 구절을 뽑는다. 구절에 특징 낱말이 여럿이면 뒤의 것", async () => {
    const r = await mockAiClient.extractLostReport("흰색 에어팟 프로, 케이스에 곰돌이 스티커, 오른쪽 아래 긁힘");
    expect(r.color).toBe("WHITE");
    expect(r.features).toEqual([
      { key: "sticker", value: "케이스에 곰돌이 스티커" },
      { key: "scratch", value: "오른쪽 아래 긁힘" },
    ]);
  });

  it("특징 낱말이 없으면 빈 배열, 최대 4개", async () => {
    expect((await mockAiClient.extractLostReport("무언가 잃어버렸어요")).features).toEqual([]);
    const many = await mockAiClient.extractLostReport("곰 스티커, 별 스티커, 긁힘 하나, 고양이 키링, 체크 무늬");
    expect(many.features).toHaveLength(4);
  });

  it("가짜 습득물(곰돌이 스티커)과 대조하면 일치", async () => {
    const found = await mockAiClient.extractFoundItem(Buffer.from(""), "image/jpeg");
    const report = await mockAiClient.extractLostReport("흰색 에어팟, 곰돌이 스티커");
    const cmp = await mockAiClient.compareFeatures(report, found);
    expect(cmp.features[0]?.verdict).toBe("MATCH");
    expect(cmp.color).toBe("MATCH");
  });
});
