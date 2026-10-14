import { distanceM, NEAREST_MAX_DISTANCE_M, nearestBuilding } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";

const A = { id: 1, name: "A관", lat: 37.6, lng: 127.0 };
const B = { id: 2, name: "B관", lat: 37.601, lng: 127.0 }; // A에서 북쪽 약 111m

describe("distanceM", () => {
  it("위도 0.001도는 약 111m", () => {
    expect(distanceM(A, B)).toBeGreaterThan(105);
    expect(distanceM(A, B)).toBeLessThan(117);
  });
});

describe("nearestBuilding (프론트가 브라우저 안에서 쓰는 공용 함수)", () => {
  it("가장 가까운 건물을 고른다", () => {
    expect(nearestBuilding([A, B], { lat: 37.6009, lng: 127.0 })?.building).toEqual(B);
  });

  it(`${NEAREST_MAX_DISTANCE_M}m보다 멀면 null`, () => {
    expect(nearestBuilding([A, B], { lat: 37.61, lng: 127.0 })).toBeNull();
  });

  it("건물이 없으면 null", () => {
    expect(nearestBuilding([], { lat: 37.6, lng: 127.0 })).toBeNull();
  });
});
