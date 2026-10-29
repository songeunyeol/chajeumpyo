import { describe, expect, it } from "vitest";
import { colorDistractors, makeQuestion, overlaps, pickDistractors } from "../../src/matching/quiz";

const Q = "이 이어폰에 달려 있는 키링은 어떤 모양인가요?";

describe("객관식 보기", () => {
  it("질문에 없는 낱말을 함께 쓰면 겹친다고 본다", () => {
    expect(overlaps("고양이 키링", "고양이 모양 키링", Q)).toBe(true);
    expect(overlaps("고양이 키링", "고양이가 그려진 키링", Q)).toBe(true);
    expect(overlaps("고양이 키링", "토끼 키링", Q)).toBe(false);
    expect(overlaps("곰돌이 스티커", "곰돌이스티커")).toBe(true);
  });

  it("정답·서로 겹치는 후보와 너무 긴 후보는 빼고 3개를 고른다", () => {
    const out = pickDistractors(
      ["고양이 키링"],
      ["고양이 모양 키링", "토끼 키링", "토끼 인형 키링", "가".repeat(31), "곰 키링", "별 키링"],
      Q,
    );
    expect(out).toEqual(["토끼 키링", "곰 키링", "별 키링"]);
  });

  it("정답 위치를 기억한다", () => {
    const q = makeQuestion("q", "keyring", "정답", ["a", "b", "c"]);
    expect(q.options[q.answer]).toBe("정답");
    expect(q.options).toHaveLength(4);
  });

  it("색 오답에는 이웃 색과 기타를 넣지 않는다", () => {
    for (let i = 0; i < 20; i++) {
      const out = colorDistractors("WHITE");
      expect(out).toHaveLength(3);
      expect(out).not.toContain("회색·은색");
      expect(out).not.toContain("흰색");
      expect(out).not.toContain("기타");
    }
  });
});
