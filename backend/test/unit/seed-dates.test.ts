import { describe, expect, it } from "vitest";
import { SAMPLE_AGES, seedDates, startOfKstDay } from "../../scripts/seed-dates";

const HOUR = 3_600_000;

describe("개발 더미 습득 시각 (seed-dates)", () => {
  it("한국 날짜 0시", () => {
    // 2026-10-25 06:00 KST = 10-24 21:00Z → 0시 KST = 10-24 15:00Z
    expect(startOfKstDay(new Date("2026-10-24T21:00:00Z")).toISOString()).toBe("2026-10-24T15:00:00.000Z");
    // 2026-10-25 23:59 KST
    expect(startOfKstDay(new Date("2026-10-25T14:59:00Z")).toISOString()).toBe("2026-10-24T15:00:00.000Z");
  });

  it("지금 기준 최근, 보관 기한은 습득 + 보관 일수, 같은 지금이면 늘 같은 값", () => {
    const now = new Date("2026-10-25T06:00:00Z"); // 15:00 KST
    for (let i = 0; i < SAMPLE_AGES.length; i++) {
      const d = seedDates(i, now, 30);
      expect(d.foundAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime() - d.foundAt.getTime()).toBeLessThanOrEqual(5 * 24 * HOUR);
      expect(d.expiresAt.getTime() - d.foundAt.getTime()).toBe(30 * 24 * HOUR);
      expect(seedDates(i, now, 30)).toEqual(d);
    }
  });

  it("체험 시드·실제 이어폰은 오늘(한국 시간) 안: 자정 직후에도 '오늘' 신고의 후보", () => {
    const justAfterMidnight = new Date("2026-10-24T15:02:00Z"); // 00:02 KST
    const today = SAMPLE_AGES.flatMap((a, i) => (a.today ? [i] : []));
    expect(today.length).toBeGreaterThanOrEqual(3);
    for (const i of today) {
      const { foundAt } = seedDates(i, justAfterMidnight, 30);
      expect(foundAt.getTime()).toBeGreaterThanOrEqual(startOfKstDay(justAfterMidnight).getTime());
      expect(foundAt.getTime()).toBeLessThanOrEqual(justAfterMidnight.getTime());
    }
  });
});
