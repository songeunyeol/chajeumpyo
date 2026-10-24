import { describe, expect, it } from "vitest";
import { formatCountdown, formatFloor, formatRemaining } from "./format";

describe("format", () => {
  it("층: 지하는 음수, 없으면 층 모름", () => {
    expect(formatFloor(-1)).toBe("지하 1층");
    expect(formatFloor(7)).toBe("7층");
    expect(formatFloor(null)).toBe("층 모름");
  });
  it("타이머 mm:ss", () => {
    expect(formatCountdown(300_000)).toBe("5:00");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });
  it("남은 시간", () => {
    expect(formatRemaining(24 * 3_600_000)).toBe("24시간 남음");
    expect(formatRemaining(200 * 60_000)).toBe("3시간 20분 남음");
    expect(formatRemaining(0)).toBe("만료됨");
  });
});
