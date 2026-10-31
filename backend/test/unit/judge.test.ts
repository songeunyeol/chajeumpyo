import type { AiFeature, FeatureComparison } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { judge } from "../../src/matching/judge";

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
