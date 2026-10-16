import { describe, expect, it } from "vitest";
import { distanceM } from "../../src/lib/geo";
import { NEAREST_MAX_DISTANCE_M, pickNearest } from "../../src/services/buildings";

const A = { id: 1, name: "A관", lat: 37.6, lng: 127.0 };
const B = { id: 2, name: "B관", lat: 37.601, lng: 127.0 }; // A에서 북쪽 약 111m

describe("distanceM", () => {
  it("위도 0.001도는 약 111m", () => {
    expect(distanceM(A, B)).toBeGreaterThan(105);
    expect(distanceM(A, B)).toBeLessThan(117);
  });
});

describe("pickNearest", () => {
  it("가장 가까운 건물을 고른다", () => {
    expect(pickNearest([A, B], { lat: 37.6009, lng: 127.0 }).building).toEqual({ id: 2, name: "B관" });
  });

  it(`${NEAREST_MAX_DISTANCE_M}m보다 멀면 null`, () => {
    expect(pickNearest([A, B], { lat: 37.61, lng: 127.0 })).toEqual({ building: null, distanceM: null });
  });

  it("건물이 없으면 null", () => {
    expect(pickNearest([], { lat: 37.6, lng: 127.0 }).building).toBeNull();
  });
});
