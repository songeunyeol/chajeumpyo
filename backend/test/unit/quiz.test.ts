import { describe, expect, it } from "vitest";
import {
  colorDistractors,
  guessProbability,
  makeQuestion,
  mutateDistractors,
  overlaps,
  pickDistractors,
  reshuffle,
  similarShape,
  uniformDistractors,
} from "../../src/matching/quiz";

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

describe("보기 모양 맞추기 (10/30 실서비스 평가: 정답만 구체적이면 티가 난다)", () => {
  it("길이·영문·숫자·낱말 수가 비슷해야 같은 모양", () => {
    expect(similarShape("안쪽에 J.H 각인", "안쪽에 S.Y 각인")).toBe(true);
    expect(similarShape("안쪽에 J.H 각인", "학번 숫자")).toBe(false);
    expect(similarShape("케이스 뒷면에 있음", "왼쪽 위 모서리")).toBe(true);
    expect(similarShape("곰돌이 스티커", "하트 모양 금속 키링 두 개 달림")).toBe(false);
  });

  it("정답의 머리글자·위치·그림 낱말만 바꿔 같은 형식의 오답을 만든다", () => {
    for (const correct of ["안쪽에 J.H 각인", "케이스 뒷면 흠집", "곰돌이 스티커"]) {
      const ds = mutateDistractors(correct);
      expect(ds).toHaveLength(3);
      for (const d of ds) {
        expect(d).not.toBe(correct);
        expect(similarShape(d, correct)).toBe(true);
      }
    }
  });

  it("막연한 준비 보기만 있으면 쓰지 않고, 같은 모양으로 채운다", () => {
    const ds = uniformDistractors("안쪽에 J.H 각인", [], ["영문 이니셜", "학번 숫자", "짧은 영어 문구"]);
    expect(ds).toHaveLength(3);
    for (const d of ds) expect(d).toMatch(/[A-Z]/);
  });

  it("같은 모양을 3개 못 채우면 빈 배열 (그 질문은 내지 않는다)", () => {
    expect(uniformDistractors("튜브형 용기", [], ["학번 숫자 2개와 영문 이니셜 표시"])).toEqual([]);
  });

  it("보기 세트를 다시 쓸 때 순서만 바뀌고 정답 위치는 따라간다", () => {
    const q = makeQuestion("q", "keyring", "고양이 키링", ["토끼 키링", "곰 키링", "오리 키링"]);
    const r = reshuffle(q);
    expect(new Set(r.options)).toEqual(new Set(q.options));
    expect(r.options[r.answer]).toBe("고양이 키링");
  });

  it("찍어서 맞힐 확률은 보기 수의 곱", () => {
    const q = makeQuestion("q", "k", "a", ["b", "c", "d"]);
    expect(guessProbability([q, q])).toBe(1 / 16);
    expect(guessProbability([q, q, q])).toBe(1 / 64);
  });
});
