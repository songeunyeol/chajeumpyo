import { describe, expect, it } from "vitest";
import { judgeAnswer } from "../../src/matching/answer";
import { compareBrand, compareByRules, compareColor } from "../../src/matching/compare";

const stored = { color: "WHITE", brand: "Apple", features: [{ key: "sticker" as const, value: "곰돌이 스티커" }] };

describe("규칙 기반 대조", () => {
  it("값이 맞으면 일치, 다르면 모순, 종류만 적으면 확인 불가", () => {
    const r = compareByRules(
      {
        color: null,
        brand: null,
        features: [
          { key: "sticker", value: "곰돌이 그림 스티커" },
          { key: "sticker", value: "토끼 스티커" },
          { key: "sticker", value: "스티커 붙어 있음" },
        ],
      },
      stored,
    );
    expect(r.features.map((f) => f.verdict)).toEqual(["MATCH", "CONTRADICT", "UNKNOWN"]);
  });

  it("종류(key)가 달라도 내용이 같으면 일치, 같은 종류가 없으면 모순이 아니라 확인 불가 (10/29 안경)", () => {
    const glasses = {
      color: "BLACK",
      brand: null,
      features: [{ key: "pattern" as const, value: "양쪽 프레임 끝 두 개의 점 장식" }],
    };
    const r = compareByRules(
      {
        color: null,
        brand: null,
        features: [
          { key: "other", value: "양쪽 프레임 끝 두 개의 점 장식" },
          { key: "other", value: "다리에 금색 로고" },
        ],
      },
      glasses,
    );
    expect(r.features).toEqual([
      { reportedKey: "other", verdict: "MATCH", storedKey: "pattern" },
      { reportedKey: "other", verdict: "UNKNOWN", storedKey: null },
    ]);
  });

  it("10/29 평가에서 진짜 주인이 떨어지던 표현: 이니셜, 한 글자, 색 표기, 브랜드 한글", () => {
    const f = (key: string, value: string) => ({ key: key as "text", value });
    const run = (reported: string, storedValue: string, key = "text") =>
      compareByRules(
        { color: null, brand: null, features: [f(key, reported)] },
        { color: null, brand: null, features: [f(key, storedValue)] },
      ).features[0]?.verdict;
    expect(run("J.H 각인", "안쪽에 J.H 각인")).toBe("MATCH");
    expect(run("별 스티커", "케이스 안 별 스티커", "sticker")).toBe("MATCH");
    expect(run("액정 우측 상단 금 간 자국", "화면 오른쪽 위 금", "scratch")).toBe("MATCH");
    expect(run("빨간색 케이스", "빨간 안경집", "case")).toBe("MATCH");
    expect(compareBrand("삼성", "Samsung")).toBe("MATCH");
    expect(compareBrand("애플", "Apple")).toBe("MATCH");
    expect(compareBrand("LG", "Apple")).toBe("CONTRADICT");
  });

  it("종류 이름이나 색·위치만 겹치면 일치가 아니다 (사칭 방지)", () => {
    const f = (key: string, value: string) => ({ key: key as "case", value });
    const run = (reported: string, storedValue: string, key = "case") =>
      compareByRules(
        { color: null, brand: null, features: [f(key, reported)] },
        { color: null, brand: null, features: [f(key, storedValue)] },
      ).features[0]?.verdict;
    expect(run("파란 안경집", "빨간 안경집")).toBe("CONTRADICT");
    expect(run("빨간 가죽 케이스", "빨간 하트 키링", "keyring")).toBe("CONTRADICT");
    expect(run("왼쪽 위 고양이 스티커", "왼쪽 위 곰돌이 스티커", "sticker")).toBe("CONTRADICT");
  });

  it("색(12색 키): 같은 색 일치, 이웃 색 확인 불가, 다른 색 모순, 기타·모르는 값 확인 불가", () => {
    expect(compareColor("WHITE", "WHITE")).toBe("MATCH");
    expect(compareColor("GRAY_SILVER", "WHITE")).toBe("UNKNOWN");
    expect(compareColor("RED", "PINK_MAGENTA")).toBe("UNKNOWN");
    expect(compareColor("BLACK", "WHITE")).toBe("CONTRADICT");
    expect(compareColor("OTHER", "WHITE")).toBe("UNKNOWN");
    expect(compareColor("흰색", "WHITE")).toBe("UNKNOWN");
    expect(compareColor(null, "WHITE")).toBe("UNKNOWN");
  });
});

describe("답 판정 규칙", () => {
  const q = "붙어 있는 스티커는 어떤 그림이나 글자인가요?";
  it("포함되면 정답, 질문 낱말만이면 오답", async () => {
    expect(await judgeAnswer(q, "곰돌이 스티커", "곰돌이")).toBe("MATCH");
    expect(await judgeAnswer(q, "곰돌이 스티커", "곰돌이 스티커요")).toBe("MATCH");
    expect(await judgeAnswer(q, "곰돌이 스티커", "스티커")).toBe("NO_MATCH");
    expect(await judgeAnswer(q, "곰돌이 스티커", "  ")).toBe("NO_MATCH");
  });

  it("부분 문자열은 정답이 아니다 (낱말 단위 비교)", async () => {
    expect(await judgeAnswer(q, "곰돌이 스티커", "돌이")).toBe("NO_MATCH");
    expect(await judgeAnswer(q, "곰돌이 스티커", "곰")).toBe("NO_MATCH");
    expect(await judgeAnswer(q, "곰돌이 스티커", "곰돌이 토끼")).toBe("NO_MATCH");
  });

  it("50자를 넘는 답은 보지 않고 오답", async () => {
    expect(await judgeAnswer(q, "곰돌이 스티커", `곰돌이 ${"가".repeat(50)}`)).toBe("NO_MATCH");
  });
});
