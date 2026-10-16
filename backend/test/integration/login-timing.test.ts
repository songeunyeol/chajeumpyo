import { describe, expect, it } from "vitest";
import { login } from "../../src/services/auth";

// 기준 8 보강: 없는 계정도 bcrypt 비교를 거쳐, 응답 시간으로 가입 여부가 드러나지 않아야 한다
describe("로그인 응답 시간", () => {
  it("없는 계정도 bcrypt 비교 시간만큼 걸린다", async () => {
    const start = performance.now();
    await expect(login("nobody@skuniv.ac.kr", "password123")).rejects.toThrow();
    expect(performance.now() - start).toBeGreaterThan(20);
  });
});
