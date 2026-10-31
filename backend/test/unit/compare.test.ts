import { describe, expect, it } from "vitest";
import { judgeAnswer } from "../../src/matching/answer";
import { compareBrand, compareByRules, compareColor } from "../../src/matching/compare";
import { dropMaskTraces, isMaskTrace } from "../../src/matching/text";

const stored = { color: "WHITE", brand: "Apple", features: [{ key: "sticker" as const, value: "곰돌이 스티커" }] };

describe("규칙 기반 대조", () => {
  it("한쪽만 없음·부정 표현이면 낱말이 겹쳐도 일치가 아니다 (10/30 배포 QA)", () => {
    const lens = { color: null, brand: null, features: [{ key: "scratch" as const, value: "왼쪽 렌즈 긁힘" }] };
    const verdicts = (values: string[]) =>
      compareByRules(
        { color: null, brand: null, features: values.map((value) => ({ key: "scratch" as const, value })) },
        lens,
      ).features.map((f) => f.verdict);
    expect(verdicts(["렌즈 흠집 없음", "렌즈가 깨끗해요", "왼쪽 렌즈 긁힘"])).toEqual([
      "CONTRADICT",
      "CONTRADICT",
      "MATCH",
    ]);
    // 둘 다 없음이면 같은 특징
    const noLid = { color: null, brand: null, features: [{ key: "other" as const, value: "뚜껑 없음" }] };
    expect(
      compareByRules({ color: null, brand: null, features: [{ key: "other", value: "뚜껑 없어요" }] }, noLid)
        .features[0]?.verdict,
    ).toBe("MATCH");
  });

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
    expect(compareBrand("삼성 갤럭시북", "Samsung")).toBe("MATCH");
    expect(compareBrand("Samsung Galaxy", "삼성")).toBe("MATCH");
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

describe("실제 사진 평가 (10/30)", () => {
  const verdicts = (
    reported: { key: "other" | "pattern" | "sticker"; value: string }[],
    storedFeatures: typeof reported,
  ) =>
    compareByRules(
      { color: null, brand: null, features: reported },
      { color: null, brand: null, features: storedFeatures },
    ).features.map((f) => f.verdict);

  it("기타·무늬는 다른 측면을 말하면 모순이 아니라 확인 불가 (핸드크림 뚜껑 ↔ 용기, 볼캡 챙 ↔ 원단)", () => {
    expect(verdicts([{ key: "other", value: "흰 뚜껑" }], [{ key: "other", value: "튜브형 용기" }])).toEqual([
      "UNKNOWN",
    ]);
    expect(verdicts([{ key: "pattern", value: "흰색 챙" }], [{ key: "pattern", value: "데님 원단" }])).toEqual([
      "UNKNOWN",
    ]);
    expect(
      verdicts(
        [{ key: "pattern", value: "앞면 해·나무·사람 자수" }],
        [{ key: "pattern", value: "사선 빗살 무늬 천 재질" }],
      ),
    ).toEqual(["UNKNOWN"]);
  });

  it("다른 측면으로 본 모름은 저장 특징 종류를 남겨 AI가 다시 볼 수 있다 (모눈 칸 ↔ 격자 무늬)", () => {
    const r = compareByRules(
      { color: null, brand: null, features: [{ key: "pattern", value: "표지 모눈 칸" }] },
      { color: null, brand: null, features: [{ key: "pattern", value: "하단 격자 무늬" }] },
    );
    expect(r.features[0]).toEqual({ reportedKey: "pattern", verdict: "UNKNOWN", storedKey: "pattern" });
  });

  it("같은 측면을 다르게 말하면 여전히 모순 (사칭 막기)", () => {
    expect(verdicts([{ key: "other", value: "꽃 자수" }], [{ key: "other", value: "별 자수" }])).toEqual([
      "CONTRADICT",
    ]);
    expect(verdicts([{ key: "pattern", value: "줄무늬" }], [{ key: "pattern", value: "체크무늬" }])).toEqual([
      "CONTRADICT",
    ]);
    // 스티커처럼 종류 자체가 대상이면 측면을 따지지 않는다
    expect(verdicts([{ key: "sticker", value: "토끼 스티커" }], [{ key: "sticker", value: "곰돌이 스티커" }])).toEqual([
      "CONTRADICT",
    ]);
  });

  it("가린 자리를 적은 특징은 뺀다", () => {
    expect(isMaskTrace("클립 부분에 회색 가림 처리됨")).toBe(true);
    expect(isMaskTrace("중앙 영역 가림 처리")).toBe(true);
    expect(isMaskTrace("펜 끝부분에 약간의 검은 얼룩")).toBe(false);
    expect(
      dropMaskTraces([
        { key: "other", value: "중앙 영역 가림 처리" },
        { key: "scratch", value: "표면 미세 흠집" },
      ]),
    ).toEqual([{ key: "scratch", value: "표면 미세 흠집" }]);
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

describe("실제 사진 35장 평가 (10/30)", () => {
  it("베이지·코랄·남색처럼 경계에 있는 색은 모순이 아니라 확인 불가", () => {
    expect(compareColor("BROWN", "YELLOW")).toBe("UNKNOWN");
    expect(compareColor("ORANGE_CORAL", "PINK_MAGENTA")).toBe("UNKNOWN");
    expect(compareColor("BLUE_TEAL", "BLACK")).toBe("UNKNOWN");
  });

  it("완전히 다른 색은 여전히 모순", () => {
    expect(compareColor("RED", "BLUE_TEAL")).toBe("CONTRADICT");
    expect(compareColor("WHITE", "BLACK")).toBe("CONTRADICT");
    expect(compareColor("YELLOW", "PURPLE")).toBe("CONTRADICT");
  });

  it("영문 브랜드 머리글자는 같은 브랜드", () => {
    expect(compareBrand("MK", "MICHAEL KORS")).toBe("MATCH");
    expect(compareBrand("Michael Kors", "MK")).toBe("MATCH");
    expect(compareBrand("MK", "Marc Jacobs")).toBe("CONTRADICT");
    expect(compareBrand("Nike", "MICHAEL KORS")).toBe("CONTRADICT");
  });
});
