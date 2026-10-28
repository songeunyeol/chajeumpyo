import {
  Category,
  FoundItemExtraction,
  itemLabel,
  relatedCategories,
  SUB_CATEGORIES,
  SUB_CATEGORY_LABELS,
  SubCategory,
  subCategoryWithin,
} from "@chajeumpyo/shared";
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

describe("세부 종류 목록", () => {
  it("모든 세부 종류는 정확히 한 큰 종류에 속하고, 이름이 있다", () => {
    const owners = new Map<string, string[]>();
    for (const [c, subs] of Object.entries(SUB_CATEGORIES))
      for (const s of subs ?? []) owners.set(s, [...(owners.get(s) ?? []), c]);
    for (const s of SubCategory.options) {
      expect(owners.get(s), s).toHaveLength(1);
      expect(SUB_CATEGORY_LABELS[s]).toBeTruthy();
    }
  });

  it("subCategoryWithin은 큰 종류에 속할 때만 돌려준다", () => {
    expect(subCategoryWithin("CHARGER", "MOUSE")).toBe("MOUSE");
    expect(subCategoryWithin("EARPHONE", "MOUSE")).toBeNull();
    expect(subCategoryWithin("UMBRELLA", "MOUSE")).toBeNull();
    expect(subCategoryWithin(null, "MOUSE")).toBeNull();
    expect(subCategoryWithin("CHARGER", 3)).toBeNull();
  });

  it("화면 이름은 세부 종류가 있으면 그 이름, 없으면 큰 종류 이름", () => {
    expect(itemLabel("CHARGER", "MOUSE")).toBe("마우스");
    expect(itemLabel("CHARGER", null)).toBe("기타 전자기기");
  });
});
