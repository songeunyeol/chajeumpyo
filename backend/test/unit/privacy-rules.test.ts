// 10/30 실제 사진 점검 뒤 가리기 기준: 물건 오탐은 줄이되 작은 얼굴·사진 속 얼굴·카드는 놓치지 않는다.
import { describe, expect, it } from "vitest";
import { isLogoText, isObjectNotFace } from "../../src/privacy/premask";
import { isLogoSafe, publicPrivacy } from "../../src/services/found-items";

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

describe("로고(큰 글자)를 살리는 기준 (10/31 A안)", () => {
  it("높이 5% 이상이면서 넓이 0.15% 이상인 글자 덩어리만 로고로 본다", () => {
    expect(isLogoText({ heightRatio: 0.056, areaRatio: 0.016 })).toBe(true); // 모자 로고 emis
    expect(isLogoText({ heightRatio: 0.019, areaRatio: 0.011 })).toBe(false); // 학생증 뒷면 주소 줄
    expect(isLogoText({ heightRatio: 0.009, areaRatio: 0.001 })).toBe(false); // 카드 번호·작은 태그
    expect(isLogoText({ heightRatio: 0.61, areaRatio: 0.0005 })).toBe(false); // 가늘고 긴 스프링 선
  });

  it("개인정보가 크게 적힐 수 있는 종류는 로고 사본을 쓰지 않는다", () => {
    for (const c of [
      "WALLET",
      "ID_CARD",
      "DRIVER_LICENSE",
      "PAYMENT_CARD",
      "TRANSIT_CARD",
      "OTHER_CARD",
      "PHONE",
      "TABLET",
      "LAPTOP",
      "EARPHONE",
      "BOOK",
      "STATIONERY",
      "KEY",
      "CASH",
      "SMARTWATCH",
    ] as const) {
      expect(isLogoSafe(c, null)).toBe(false);
    }
    expect(isLogoSafe("BAG", "POUCH")).toBe(false); // 이니셜 자수
    expect(isLogoSafe("ETC", null)).toBe(false);
    expect(isLogoSafe("ACCESSORY", "WRISTWATCH")).toBe(false);
  });

  it("옷·모자·가방(파우치 제외)·우산·텀블러·화장품은 로고 사본을 쓸 수 있다", () => {
    expect(isLogoSafe("HAT", null)).toBe(true);
    expect(isLogoSafe("CLOTHING", "TOP")).toBe(true);
    expect(isLogoSafe("BAG", "BACKPACK")).toBe(true);
    expect(isLogoSafe("UMBRELLA", null)).toBe(true);
    expect(isLogoSafe("TUMBLER", null)).toBe(true);
    expect(isLogoSafe("ETC", "COSMETICS")).toBe(true);
  });
});
