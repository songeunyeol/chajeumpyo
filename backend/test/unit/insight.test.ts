import { describe, expect, it } from "vitest";
import { buildInsight } from "../../src/services/hotspots";

const row = (hour: number, building = "혜인관", category: "UMBRELLA" | "CHARGER" | null = "UMBRELLA") => ({
  building,
  hour,
  category,
  isSeed: false,
});

describe("분실 다발 문구", () => {
  it("자정을 넘는 시간대도 하나로 묶는다 (23시, 0시)", () => {
    expect(buildInsight([row(23), row(0)])).toBe("혜인관에서 저녁 11시~새벽 1시에 우산 분실이 가장 많아요.");
  });

  it("오전에서 오후로 넘어가면 둘 다 적는다", () => {
    expect(buildInsight([row(11), row(12)])).toBe("혜인관에서 오전 11시~오후 1시에 우산 분실이 가장 많아요.");
  });

  it("오전 시간대 표시", () => {
    expect(buildInsight([row(9), row(10), row(10)])).toBe("혜인관에서 오전 9시~11시에 우산 분실이 가장 많아요.");
  });

  it("종류가 없는 기록은 문구 계산에서 뺀다", () => {
    expect(buildInsight([row(13, "혜인관", null), row(13, "혜인관", null)])).toContain("데이터가 적어서");
  });
});
