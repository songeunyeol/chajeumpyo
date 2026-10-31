import type { AiFeature, FeatureComparison } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { judge } from "../../src/matching/judge";
import {
  isGenericFeature,
  isInnerText,
  isPositionOnly,
  isQuizable,
  isThumbnailVisible,
  isUntrustedFragment,
} from "../../src/matching/questions";

describe("특징 분류 (10/31 사칭 평가·검증 1·2)", () => {
  const f = (key: AiFeature["key"], value: string) => ({ key, value }) as AiFeature;
  it("글자 조각: 영어 기능어는 늘, 3글자 이하는 설명에 없을 때만 믿지 않는다", () => {
    expect(isUntrustedFragment(f("text", "is 로고 글자"), "진회색 텀블러")).toBe(true);
    expect(isUntrustedFragment(f("text", "in"), null)).toBe(true);
    expect(isUntrustedFragment(f("text", "KGB 이니셜 자수"), "뒷면에 KGB 이니셜 자수")).toBe(false);
    expect(isUntrustedFragment(f("text", "KGB 이니셜 자수"), "초록 필통")).toBe(true);
    expect(isUntrustedFragment(f("text", "Heroine Make 문구"), null)).toBe(false);
    expect(isUntrustedFragment(f("sticker", "is"), null)).toBe(false);
  });
  it("안쪽 작은 글자와 재질·구조는 묻지 않는다", () => {
    expect(isInnerText(f("text", "kkeulle made in korea"))).toBe(true);
    expect(isInnerText(f("text", "안쪽에 J.H 각인"))).toBe(false);
    expect(isQuizable(f("other", "가죽 질감"))).toBe(false);
    expect(isQuizable(f("other", "지퍼 포켓 위치"))).toBe(false);
    expect(isQuizable(f("other", "빨간 리본 장식"))).toBe(true);
    expect(isGenericFeature(f("other", "가죽 질감"))).toBe(true);
  });
  it("썸네일로 보이는 것: 큰 부분 색·모양·무늬", () => {
    expect(isThumbnailVisible(f("case", "흰색 뚜껑"))).toBe(true);
    expect(isThumbnailVisible(f("other", "강아지 모양"))).toBe(true);
    expect(isThumbnailVisible(f("pattern", "레이스 문양"))).toBe(true);
    expect(isThumbnailVisible(f("sticker", "곰돌이 스티커"))).toBe(false);
    expect(isThumbnailVisible(f("case", "VOVA 로고 케이스"))).toBe(false);
  });
  it("위치만 다른 보기", () => {
    expect(isPositionOnly(["상단 지퍼 포켓", "하단 지퍼 포켓", "측면 지퍼 포켓", "중앙 지퍼 포켓"])).toBe(true);
    expect(isPositionOnly(["곰돌이 스티커", "토끼 스티커", "별 스티커", "하트 스티커"])).toBe(false);
  });
});

const stored: AiFeature[] = [
  { key: "sticker", value: "곰돌이 스티커" },
  { key: "scratch", value: "오른쪽 아래 긁힘" },
];
type Verdict = FeatureComparison["features"][number]["verdict"];
const cmp = (sticker: Verdict | null, scratch: Verdict | null, color: FeatureComparison["color"] = "UNKNOWN") =>
  ({
    color,
    brand: "UNKNOWN",
    features: [
      ...(sticker ? [{ reportedKey: "sticker", storedKey: "sticker", verdict: sticker }] : []),
      ...(scratch ? [{ reportedKey: "scratch", storedKey: "scratch", verdict: scratch }] : []),
    ],
  }) as FeatureComparison;
const run = (c: FeatureComparison) =>
  judge(
    c,
    stored,
    c.features.map((f) => f.reportedKey),
    stored,
  ).result;

describe("판정 규칙 (10/31 B안)", () => {
  it("모순 없이 75% 이상 맞으면 통과", () => {
    expect(run(cmp("MATCH", "MATCH"))).toBe("PASS");
  });
  it("맞힌 특징이 있으면 모순이 있어도 객관식", () => {
    expect(run(cmp("MATCH", "CONTRADICT"))).toBe("BORDERLINE");
    expect(run(cmp("MATCH", null, "CONTRADICT"))).toBe("BORDERLINE");
  });
  it("맞힌 특징 없이 특징 모순만 있으면 바로 실패", () => {
    expect(run(cmp("CONTRADICT", null))).toBe("FAIL");
  });
  it("색·브랜드가 다른 것만으로는 실패하지 않는다 (10/31 실사용 영상: 연보라를 분홍이라 한 주인이 잠겼다)", () => {
    expect(run(cmp(null, null, "CONTRADICT"))).toBe("BORDERLINE");
    expect(run({ ...cmp(null, null), brand: "CONTRADICT" })).toBe("BORDERLINE");
    // 바로 통과는 막는다
    expect(run(cmp("MATCH", "MATCH", "CONTRADICT"))).toBe("BORDERLINE");
  });
  it("설명에서 맞힌 특징은 맞힌 개수에 들지만 바로 통과 비율에는 들지 않는다", () => {
    const c = {
      color: "UNKNOWN",
      brand: "UNKNOWN",
      features: [{ reportedKey: "other", storedKey: "description", verdict: "MATCH" }],
    } as FeatureComparison;
    const j = judge(c, stored, ["other"], stored);
    expect(j.matches).toBe(1);
    expect(j.result).toBe("BORDERLINE");
  });
  it("맞힌 것도 모순도 없으면 객관식(찍기)", () => {
    expect(run(cmp(null, null))).toBe("BORDERLINE");
  });
});

describe('바로 통과 조건 (10/31 사칭 평가: 흠집 하나뿐인 에어팟을 "스크래치 조금"으로 바로 통과)', () => {
  const match = (...keys: string[]) =>
    ({
      color: "MATCH",
      brand: "UNKNOWN",
      features: keys.map((k) => ({ reportedKey: k, storedKey: k, verdict: "MATCH" })),
    }) as FeatureComparison;
  it("사진 특징이 흠집 하나뿐이면 맞혀도 객관식, 잘 아는 특징이 없으면 색·브랜드로 묻는다(questionFeature null)", () => {
    const only: AiFeature[] = [{ key: "scratch", value: "표면 미세한 흠집" }];
    const j = judge(match("scratch"), only, ["scratch"], only);
    expect(j.result).toBe("BORDERLINE");
    expect(j.passBlocked).toBe(true);
    expect(j.questionFeature).toBeNull();
  });
  it("특징이 하나뿐이면 구체적인 특징이어도 바로 통과하지 않고 그 특징을 다시 묻는다", () => {
    const only: AiFeature[] = [{ key: "sticker", value: "곰돌이 스티커" }];
    const j = judge(match("sticker"), only, ["sticker"], only);
    expect(j.result).toBe("BORDERLINE");
    expect(j.questionFeature?.key).toBe("sticker");
  });
  it("값이 사용 흔적이면 다른 종류로 저장돼도 흔한 특징으로 본다", () => {
    const two: AiFeature[] = [
      { key: "scratch", value: "뒷면 긁힘" },
      { key: "other", value: "모서리 까짐" },
    ];
    expect(judge(match("scratch", "other"), two, ["scratch", "other"], two).result).toBe("BORDERLINE");
  });
  it("구체적인 특징을 하나 이상 맞히고 특징이 둘 이상이면 지금처럼 바로 통과", () => {
    expect(judge(match("sticker", "scratch"), stored, ["sticker", "scratch"], stored).result).toBe("PASS");
  });
});
