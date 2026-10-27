import { describe, expect, it } from "vitest";
import { judgeAnswer } from "../../src/matching/answer";
import { compareByRules, compareColor } from "../../src/matching/compare";

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
