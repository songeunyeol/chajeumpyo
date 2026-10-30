// 관리자 시연의 분실 다발: 서버가 실제 통계와 같은 집계 함수로 계산한다 (10/30)
import { HotspotResponse } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { DEMO_FOUND, demoHotspots } from "../../src/services/demo-hotspots";
import { buildInsight, buildPriorities, computeHotspots, hotspotRange } from "../../src/services/hotspots";

const NOW = new Date("2026-10-30T03:00:00Z"); // 한국 10/30 낮 12시

describe("시연 분실 다발", () => {
  it("응답 형식이 실제 통계와 같고 항상 시연 표시", () => {
    const res = demoHotspots({}, NOW);
    expect(HotspotResponse.parse(res)).toEqual(res);
    expect(res.isSeedData).toBe(true);
    expect(res.from).toBe("2026-10-01");
    expect(res.to).toBe("2026-10-30");
    expect(res.total).toBe(DEMO_FOUND.length);
  });

  it("우선순위·한 줄 요약은 실제 집계 함수가 낸 결과와 같다", () => {
    const res = demoHotspots({}, NOW);
    const range = hotspotRange({}, NOW);
    const rows = DEMO_FOUND.map((f) => ({
      building: f.building,
      hour: f.hour,
      category: f.category,
      isSeed: true,
      foundAt: new Date(
        Date.parse(`2026-10-30T${String(f.hour).padStart(2, "0")}:20:00+09:00`) - f.daysAgo * 86_400_000,
      ),
      status: f.status,
    }));
    expect(res.priorities).toEqual(buildPriorities(rows, range.start, range.end));
    expect(res.topInsight).toBe(buildInsight(rows));
    expect(computeHotspots(range, rows, [], rows, true).byBuilding).toEqual(res.byBuilding);
  });

  it("유담관 점심 직후 충전기가 높음으로 1순위, 혜인관 이어폰 신고 반복", () => {
    const res = demoHotspots({}, NOW);
    expect(res.priorities[0]).toMatchObject({ building: "유담관", category: "CHARGER", level: "HIGH", trend: "UP" });
    expect(res.priorities[0]?.expectedNextWeek).toBeGreaterThan(0);
    expect(res.reportHotspots[0]).toMatchObject({
      building: "혜인관",
      category: "EARPHONE",
      reports: 4,
      open: 3,
      found: 1,
    });
  });

  it("기간 밖 시연 데이터는 빠진다", () => {
    const res = demoHotspots({ from: "2026-10-28", to: "2026-10-30" }, NOW);
    expect(res.total).toBe(DEMO_FOUND.filter((f) => f.daysAgo <= 2).length);
  });

  it("개인정보·식별자 필드가 없다", () => {
    const keys = new Set<string>();
    JSON.stringify(demoHotspots({}, NOW), (k, v) => {
      keys.add(k);
      return v;
    });
    for (const k of ["id", "email", "userId", "phone", "imageUrl", "hiddenTrait"]) expect(keys.has(k)).toBe(false);
    expect(JSON.stringify(demoHotspots({}, NOW))).not.toContain("@");
  });
});
