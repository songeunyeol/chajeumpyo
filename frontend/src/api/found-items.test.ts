import { CONSENT_VERSION } from "@chajeumpyo/shared";
import { buildRegisterForm } from "./found-items";

describe("buildRegisterForm (B14: 좌표는 보내지 않음)", () => {
  it("건물 id·보관·층·동의만 담고 좌표 필드는 없다", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const input = {
      image,
      buildingId: 3,
      storageType: "HANDED_OVER" as const,
      storagePlaceId: 2,
      floor: -1,
      consent: { version: CONSENT_VERSION, externalAi: true, location: true },
      // 화면 실수로 좌표가 섞여 들어와도 본문에는 들어가지 않는다
      lat: 37.6,
      lng: 127.0,
    };
    const form = await buildRegisterForm(input);
    const keys = [...form.keys()].sort();
    expect(keys).toEqual(
      [
        "buildingId",
        "consentExternalAi",
        "consentLocation",
        "consentVersion",
        "floor",
        "image",
        "storagePlaceId",
        "storageType",
      ].sort(),
    );
    expect(form.get("floor")).toBe("-1");
    expect(form.get("consentVersion")).toBe(CONSENT_VERSION);
    expect(form.get("consentLocation")).toBe("true");
  });

  it("그 자리에 둠이면 보관처를 보내지 않는다", async () => {
    const form = await buildRegisterForm({
      image: new Blob(["x"], { type: "image/png" }),
      buildingId: 1,
      storageType: "IN_PLACE",
      storagePlaceId: 9,
      consent: { location: false },
    });
    expect(form.has("storagePlaceId")).toBe(false);
    expect(form.has("floor")).toBe(false);
    expect(form.get("consentExternalAi")).toBe("true");
  });
});
