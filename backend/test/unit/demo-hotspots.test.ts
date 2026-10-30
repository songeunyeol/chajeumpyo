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
    expect(res.total).toBe(DEMO_FOUND.filter((f) => f.daysAgo <= 29).length);
  });

  it("우선순위·한 줄 요약은 실제 집계 함수가 낸 결과와 같다", () => {
    const res = demoHotspots({}, NOW);
    const range = hotspotRange({}, NOW);
    const rows = DEMO_FOUND.filter((f) => f.daysAgo <= 29).map((f) => ({
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
      reports: 3, // 기본 30일: 45일 전 신고는 빠진다
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
  it("7·30·90일 결과가 서로 다르고, 90일은 방학까지 포함한다", () => {
    const totals = [7, 30, 90].map(
      (d) =>
        demoHotspots(
          {
            from: new Date(NOW.getTime() + 9 * 3_600_000 - (d - 1) * 86_400_000).toISOString().slice(0, 10),
            to: "2026-10-30",
          },
          NOW,
        ).total,
    );
    expect(new Set(totals).size).toBe(3);
    expect(totals[2]).toBe(DEMO_FOUND.length);
    expect(DEMO_FOUND.some((f) => f.daysAgo >= 60)).toBe(true);
  });

  it("추세와 다음 7일 예상이 같은 숫자에서 나와 서로 어긋나지 않는다", () => {
    for (const d of [7, 30, 90]) {
      const from = new Date(NOW.getTime() + 9 * 3_600_000 - (d - 1) * 86_400_000).toISOString().slice(0, 10);
      const res = demoHotspots({ from, to: "2026-10-30" }, NOW);
      const half = d / 2;
      for (const p of res.priorities) {
        expect(p.trend).toBe(p.recent > p.earlier ? "UP" : p.recent < p.earlier ? "DOWN" : "SAME");
        expect(p.expectedNextWeek).toBe(Math.round((p.recent / half) * 7 * 10) / 10);
        expect(p.forecastBasis).toContain(`앞 ${p.earlier}건 → 최근 ${p.recent}건`);
        // 늘고 있으면 예상은 기간 평균보다 크거나 같고, 줄고 있으면 작거나 같다
        const avgWeek = (p.count / d) * 7;
        if (p.trend === "UP") expect(p.expectedNextWeek).toBeGreaterThanOrEqual(Math.round(avgWeek * 10) / 10 - 0.05);
        if (p.trend === "DOWN") expect(p.expectedNextWeek).toBeLessThanOrEqual(Math.round(avgWeek * 10) / 10 + 0.05);
      }
    }
  });

  it("7일로 봐도 유담관 충전기는 늘어남으로 나온다", () => {
    const res = demoHotspots({ from: "2026-10-24", to: "2026-10-30" }, NOW);
    expect(res.priorities.find((p) => p.building === "유담관" && p.category === "CHARGER")).toMatchObject({
      trend: "UP",
    });
    expect(res.priorities[0]?.forecastBasis).toContain("참고용");
  });
});

describe("기간 검증과 시연 데이터 날짜 (실서비스 평가 10/30)", () => {
  it("미래 기간에는 시연 데이터가 생기지 않는다: 끝이 미래면 오늘까지로 자른다", () => {
    const res = demoHotspots({ from: "2026-10-25", to: "2026-11-20" }, NOW);
    expect(res.to).toBe("2026-10-30");
    expect(res.clampedToToday).toBe(true);
    expect(HotspotResponse.parse(res)).toEqual(res);
  });

  it("시작이 미래면 400(VALIDATION_ERROR)", () => {
    expect(() => demoHotspots({ from: "2026-11-05", to: "2026-11-20" }, NOW)).toThrow(/아직 오지 않은 기간/);
    expect(() => hotspotRange({ from: "2026-11-05" }, NOW)).toThrow();
  });

  it("오늘까지인 기간은 자르지 않는다", () => {
    expect(demoHotspots({ from: "2026-10-01", to: "2026-10-30" }, NOW).clampedToToday).toBeUndefined();
  });

  it("신고 반복도 기간에 따라 달라진다", () => {
    const total = (from: string) =>
      demoHotspots({ from, to: "2026-10-30" }, NOW).reportHotspots.reduce((n, h) => n + h.reports, 0);
    const d7 = total("2026-10-24");
    const d30 = total("2026-10-01");
    const d90 = total("2026-08-02");
    expect(d7).toBeLessThan(d30);
    expect(d30).toBeLessThan(d90);
  });

  it("기타 전자기기 예방 조치는 분류 이름에 맞는 문구", () => {
    const top = demoHotspots({}, NOW).priorities.find((p) => p.category === "CHARGER");
    expect(top?.action).toContain("전자기기");
  });
});
