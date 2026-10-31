// 체험·시연 기능 끄기(DEMO_MODE): 꺼져 있으면 체험 경로는 없는 경로처럼 404 (10/31 심사용 계정으로 전환)
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/env", () => ({ demoEnabled: false }));

describe("requireDemoEnabled", () => {
  it("꺼져 있으면 NOT_FOUND로 넘긴다", async () => {
    const { requireDemoEnabled } = await import("../../src/middlewares/demo");
    const next = vi.fn();
    requireDemoEnabled({} as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
