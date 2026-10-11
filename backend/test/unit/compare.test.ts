import { describe, expect, it } from "vitest";
import { judgeAnswer } from "../../src/matching/answer";
import { compareByRules, compareColor } from "../../src/matching/compare";

const stored = { color: "흰색", brand: "Apple", features: [{ key: "sticker", value: "곰돌이 스티커" }] };

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

  it("색: 같은 색 일치, 비슷한 색 확인 불가, 다른 색 모순, 모르는 색 확인 불가", () => {
    expect(compareColor("흰색", "흰색")).toBe("MATCH");
    expect(compareColor("아이보리", "흰색")).toBe("UNKNOWN");
    expect(compareColor("검정", "흰색")).toBe("CONTRADICT");
    expect(compareColor("무지개", "흰색")).toBe("UNKNOWN");
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
});
