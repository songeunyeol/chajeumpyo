// 10/30 실제 사진 점검 뒤 가리기 기준: 물건 오탐은 줄이되 작은 얼굴·사진 속 얼굴·카드는 놓치지 않는다.
import { describe, expect, it } from "vitest";
import { isObjectNotFace } from "../../src/privacy/premask";
import { publicPrivacy } from "../../src/services/found-items";

describe("얼굴 후보를 물건 오탐으로 빼는 기준", () => {
  it("컬러 사진의 큰 후보이면서 피부색이 거의 없을 때만 뺀다 (데님 모자 로고)", () => {
    expect(isObjectNotFace({ areaRatio: 0.39, skinRatio: 0.06, colorRatio: 0.22 })).toBe(true);
  });

  it("작은 얼굴은 피부색과 관계없이 남긴다 (포토카드·학생증 사진 속 얼굴, 단체 사진)", () => {
    expect(isObjectNotFace({ areaRatio: 0.02, skinRatio: 0, colorRatio: 0.5 })).toBe(false);
    expect(isObjectNotFace({ areaRatio: 0.11, skinRatio: 0.03, colorRatio: 0.5 })).toBe(false);
  });

  it("흑백 사진의 얼굴은 남긴다 (피부색 0%)", () => {
    expect(isObjectNotFace({ areaRatio: 0.06, skinRatio: 0, colorRatio: 0 })).toBe(false);
    expect(isObjectNotFace({ areaRatio: 0.3, skinRatio: 0, colorRatio: 0.005 })).toBe(false);
  });

  it("코·입을 가린 실제 얼굴(피부색 17%)은 남긴다", () => {
    expect(isObjectNotFace({ areaRatio: 0.2, skinRatio: 0.17, colorRatio: 0.39 })).toBe(false);
  });
});

describe("공개 사진 흐리기 (2단계 가리기)", () => {
  const region = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };
  it("카드로 분류된 물건은 민감 영역이 없어도 사진 전체를 흐린다", () => {
    for (const category of ["ID_CARD", "DRIVER_LICENSE", "PAYMENT_CARD", "TRANSIT_CARD", "OTHER_CARD"] as const) {
      expect(publicPrivacy({ category, isSensitive: false, sensitiveRegions: [region] })).toEqual({
        sensitive: true,
        regions: [],
      });
    }
  });

  it("다른 물건은 AI가 알려 준 영역만, AI 결과가 없으면 전체를 흐린다", () => {
    expect(publicPrivacy({ category: "WALLET", isSensitive: true, sensitiveRegions: [region] })).toEqual({
      sensitive: true,
      regions: [region],
    });
    expect(publicPrivacy({ category: "UMBRELLA", isSensitive: false, sensitiveRegions: [] })).toEqual({
      sensitive: false,
      regions: [],
    });
    expect(publicPrivacy(null)).toEqual({ sensitive: true, regions: [] });
  });
});
