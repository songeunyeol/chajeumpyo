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
  it("맞힌 특징 없이 모순만 있으면 바로 실패", () => {
    expect(run(cmp("CONTRADICT", null))).toBe("FAIL");
    expect(run(cmp(null, null, "CONTRADICT"))).toBe("FAIL");
  });
  it("맞힌 것도 모순도 없으면 객관식(찍기)", () => {
    expect(run(cmp(null, null))).toBe("BORDERLINE");
  });
});
