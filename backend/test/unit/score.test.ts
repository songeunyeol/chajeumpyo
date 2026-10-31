import { describe, expect, it } from "vitest";
import { CATEGORY_SCORE, SUB_CATEGORY_MISMATCH_SCORE, WEIGHTS } from "../../src/matching/policy";
import { categoryScore, placeScore, scoreCandidate, timeScore } from "../../src/matching/score";

const h = (n: number) => new Date(Date.UTC(2026, 9, 13, 12) + n * 3600_000);

describe("후보 점수", () => {
  it("가중치 합은 1", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("종류: 정확 > 2순위 > 연관 > 기타 > 무관", () => {
    expect(categoryScore("EARPHONE", { category: "EARPHONE", categoryAlt: null })).toBe(CATEGORY_SCORE.exact);
    expect(categoryScore("EARPHONE", { category: "STATIONERY", categoryAlt: "EARPHONE" })).toBe(CATEGORY_SCORE.alt);
    expect(categoryScore("EARPHONE", { category: "CHARGER", categoryAlt: null })).toBe(CATEGORY_SCORE.related);
    expect(categoryScore("EARPHONE", { category: "ETC", categoryAlt: null })).toBe(CATEGORY_SCORE.etc);
    expect(categoryScore("EARPHONE", { category: "UMBRELLA", categoryAlt: null })).toBe(0);
  });

  it("장소: 같은 건물 1, 모름 0.5, 다름 0", () => {
    expect([placeScore(1, 1), placeScore(null, 1), placeScore(2, 1)]).toEqual([1, 0.5, 0]);
  });

  it("시간: 분실 전 0, 2시간 1, 24시간 0.6, 72시간 0.3, 그 뒤 0", () => {
    const [from, to] = [h(0), h(1)];
    expect(timeScore(from, to, h(-1))).toBe(0);
    expect(timeScore(from, to, h(0.5))).toBe(1);
    expect(timeScore(from, to, h(3))).toBe(1);
    expect(timeScore(from, to, h(20))).toBe(0.6);
    expect(timeScore(from, to, h(60))).toBe(0.3);
    expect(timeScore(from, to, h(100))).toBe(0);
  });

  it("모든 항목이 맞으면 1", () => {
    const s = scoreCandidate(
      { category: "EARPHONE", lostFrom: h(0), lostTo: h(1), buildingId: 1, color: "흰색", brand: "Apple" },
      { category: "EARPHONE", categoryAlt: null, foundAt: h(1), buildingId: 1, color: "흰색 계열", brand: "apple" },
      1,
    );
    expect(s.total).toBeCloseTo(1);
  });
});

describe("세부 종류 점수", () => {
  const item = { category: "CHARGER" as const, categoryAlt: null };
  it("큰 종류가 같고 세부 종류가 다르면 깎는다, 같거나 한쪽이라도 모르면 그대로", () => {
    expect(categoryScore("CHARGER", { ...item, subCategory: "MOUSE" }, "MOUSE")).toBe(CATEGORY_SCORE.exact);
    expect(categoryScore("CHARGER", { ...item, subCategory: "POWER_BANK" }, "MOUSE")).toBe(SUB_CATEGORY_MISMATCH_SCORE);
    expect(categoryScore("CHARGER", { ...item, subCategory: null }, "MOUSE")).toBe(CATEGORY_SCORE.exact);
    expect(categoryScore("CHARGER", { ...item, subCategory: "MOUSE" }, null)).toBe(CATEGORY_SCORE.exact);
    // 세부 종류가 달라도 연관 종류보다는 높다
    expect(SUB_CATEGORY_MISMATCH_SCORE).toBeGreaterThan(CATEGORY_SCORE.related);
  });
});

describe("지갑 ↔ 파우치 연관 (10/30)", () => {
  it("지갑 신고에 파우치는 연관 종류, 다른 가방은 아니다", () => {
    expect(categoryScore("WALLET", { category: "BAG", categoryAlt: null, subCategory: "POUCH" })).toBe(
      CATEGORY_SCORE.related,
    );
    expect(categoryScore("WALLET", { category: "BAG", categoryAlt: null, subCategory: "BACKPACK" })).toBe(0);
    expect(categoryScore("WALLET", { category: "BAG", categoryAlt: null, subCategory: null })).toBe(0);
  });

  it("파우치 신고에 지갑은 연관 종류, 세부 종류를 모르는 가방 신고에는 넣지 않는다", () => {
    const wallet = { category: "WALLET" as const, categoryAlt: null, subCategory: "BIFOLD_WALLET" };
    expect(categoryScore("BAG", wallet, "POUCH")).toBe(CATEGORY_SCORE.related);
    expect(categoryScore("BAG", wallet, null)).toBe(0);
  });

  it("같은 종류가 연관 종류보다 먼저", () => {
    expect(CATEGORY_SCORE.exact).toBeGreaterThan(CATEGORY_SCORE.related);
  });
});

describe("연관 종류라도 세부 종류끼리 관계없으면 뺀다 (기획 피드백 10/31)", () => {
  const charger = (subCategory: string | null) => ({ category: "CHARGER" as const, categoryAlt: null, subCategory });

  it("무선 이어폰 신고에 마우스·키보드·카메라 등은 후보가 아니다", () => {
    for (const sub of ["MOUSE", "KEYBOARD", "CAMERA", "GAME_CONSOLE", "USB_MEMORY"]) {
      expect(categoryScore("EARPHONE", charger(sub), "WIRELESS_EARBUDS")).toBe(0);
    }
  });

  it("이어폰 신고에 케이블·보조배터리는 그대로 연관 종류", () => {
    for (const sub of ["CABLE_CHARGER", "POWER_BANK"]) {
      expect(categoryScore("EARPHONE", charger(sub), "WIRELESS_EARBUDS")).toBe(CATEGORY_SCORE.related);
    }
  });

  it("한쪽 세부 종류를 모르면 지금처럼 연관 종류", () => {
    expect(categoryScore("EARPHONE", charger("MOUSE"), null)).toBe(CATEGORY_SCORE.related);
    expect(categoryScore("EARPHONE", charger(null), "WIRELESS_EARBUDS")).toBe(CATEGORY_SCORE.related);
  });

  it("대칭: 마우스 신고에 이어폰·휴대폰은 뺀다", () => {
    expect(
      categoryScore("CHARGER", { category: "EARPHONE", categoryAlt: null, subCategory: "HEADPHONE" }, "MOUSE"),
    ).toBe(0);
    expect(categoryScore("CHARGER", { category: "PHONE", categoryAlt: null }, "MOUSE")).toBe(0);
    expect(categoryScore("CHARGER", { category: "PHONE", categoryAlt: null }, "POWER_BANK")).toBe(
      CATEGORY_SCORE.related,
    );
  });

  it("휴대폰은 세부 종류가 없어도 정해진 것으로 보고 마우스를 뺀다", () => {
    expect(categoryScore("PHONE", charger("MOUSE"))).toBe(0);
    expect(categoryScore("PHONE", charger("CABLE_CHARGER"))).toBe(CATEGORY_SCORE.related);
  });

  it("가방·모자 신고에 신발은 뺀다, 다른 옷은 그대로", () => {
    const clothing = (subCategory: string) => ({ category: "CLOTHING" as const, categoryAlt: null, subCategory });
    expect(categoryScore("HAT", clothing("SHOES"))).toBe(0);
    expect(categoryScore("HAT", clothing("OUTER"))).toBe(CATEGORY_SCORE.related);
    expect(categoryScore("BAG", clothing("SHOES"), "BACKPACK")).toBe(0);
  });

  it("1순위 세부 종류가 신고와 관계없으면 2순위 종류로도 후보에 넣지 않는다 (QA 10/31)", () => {
    const mouseWithEarphoneAlt = {
      category: "CHARGER" as const,
      categoryAlt: "EARPHONE" as const,
      subCategory: "MOUSE",
    };
    expect(categoryScore("EARPHONE", mouseWithEarphoneAlt, "WIRELESS_EARBUDS")).toBe(0);
    // 신고 세부 종류를 모르면 관계없다고 단정하지 않는다
    expect(categoryScore("EARPHONE", mouseWithEarphoneAlt)).toBe(CATEGORY_SCORE.alt);
    // 1순위가 관계있는 세부 종류(보조배터리)면 2순위 점수를 그대로 쓴다
    expect(
      categoryScore(
        "EARPHONE",
        { category: "CHARGER", categoryAlt: "EARPHONE", subCategory: "POWER_BANK" },
        "WIRELESS_EARBUDS",
      ),
    ).toBe(CATEGORY_SCORE.alt);
    // 1순위가 연관 묶음 밖이면 지금처럼 2순위로 찾는다
    expect(categoryScore("EARPHONE", { category: "STATIONERY", categoryAlt: "EARPHONE" }, "WIRELESS_EARBUDS")).toBe(
      CATEGORY_SCORE.alt,
    );
  });
  it("세부 종류를 아는 기타 신고(화장품)는 종류를 아는 다른 물건을 1·2순위 어디로도 넣지 않는다 (10/31 시연 영상)", () => {
    const mouse = { category: "CHARGER" as const, categoryAlt: null, subCategory: "MOUSE" };
    expect(categoryScore("ETC", mouse, "COSMETICS")).toBe(0);
    expect(categoryScore("ETC", { category: "UMBRELLA", categoryAlt: null }, "COSMETICS")).toBe(0);
    // 2순위가 기타가 아니면 2순위로도 넣지 않는다 (아이라이너가 필기구로 잡힌 경우의 반대 방향)
    expect(
      categoryScore("ETC", { category: "CHARGER", categoryAlt: "STATIONERY", subCategory: "MOUSE" }, "COSMETICS"),
    ).toBe(0);
    // 기타로 본 물건은 그대로 찾는다
    expect(categoryScore("ETC", { category: "ETC", categoryAlt: null, subCategory: "COSMETICS" }, "COSMETICS")).toBe(
      CATEGORY_SCORE.exact,
    );
    expect(categoryScore("ETC", { category: "ETC", categoryAlt: null, subCategory: null }, "COSMETICS")).toBe(
      CATEGORY_SCORE.exact,
    );
    // AI가 2순위로 기타를 붙인 물건(필기구로 본 아이라이너)은 찾는다
    expect(categoryScore("ETC", { category: "STATIONERY", categoryAlt: "ETC" }, "COSMETICS")).toBe(CATEGORY_SCORE.alt);
    // 세부 종류를 모르는 기타 신고는 지금처럼 모든 종류를 본다
    expect(categoryScore("ETC", mouse)).toBe(CATEGORY_SCORE.etc);
  });
});
