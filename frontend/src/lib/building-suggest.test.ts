import type { BuildingListItem } from "@chajeumpyo/shared";
import { describe, expect, it, vi } from "vitest";
import { suggestBuilding } from "./building-suggest";

const buildings: BuildingListItem[] = [
  { id: 1, name: "유담관", lat: 37.6153, lng: 127.0127 },
  { id: 2, name: "청운관", lat: 37.6146, lng: 127.0136 },
];
const near2 = { lat: 37.61461, lng: 127.01361 };
const far = { lat: 37.5, lng: 127.0 };
const file = new Blob(["x"]);

describe("suggestBuilding (F-02, QA B14)", () => {
  it("사진 EXIF GPS가 있으면 가장 가까운 건물을 먼저 고른다", async () => {
    const readGeo = vi.fn();
    const r = await suggestBuilding(file, buildings, true, { readExif: async () => near2, readGeo });
    expect(r).toEqual({ building: buildings[1], source: "exif" });
    expect(readGeo).not.toHaveBeenCalled();
  });

  it("EXIF가 없고 위치 동의가 있으면 브라우저 위치를 쓴다", async () => {
    const r = await suggestBuilding(file, buildings, true, { readExif: async () => null, readGeo: async () => near2 });
    expect(r.source).toBe("geolocation");
    expect(r.building?.id).toBe(2);
  });

  it("위치 동의가 없으면 브라우저 위치를 묻지 않고 직접 고르게 한다", async () => {
    const readGeo = vi.fn(async () => near2);
    const r = await suggestBuilding(file, buildings, false, { readExif: async () => null, readGeo });
    expect(readGeo).not.toHaveBeenCalled();
    expect(r).toEqual({ building: null, source: "manual" });
  });

  it("사진 위치가 학교에서 멀면 다음 단계로 넘어간다", async () => {
    const r = await suggestBuilding(file, buildings, true, { readExif: async () => far, readGeo: async () => near2 });
    expect(r.source).toBe("geolocation");
  });

  it("결과에 좌표를 담지 않는다 (건물과 출처만)", async () => {
    const r = await suggestBuilding(file, buildings, true, { readExif: async () => near2, readGeo: async () => null });
    expect(Object.keys(r).sort()).toEqual(["building", "source"]);
    expect(JSON.stringify(r)).not.toContain(String(near2.lat));
  });
});
