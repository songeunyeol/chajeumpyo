// 가장 가까운 건물 고르기 (F-01, open-issues #34, QA B14).
// 좌표는 서버로 보내지 않는다. 프론트가 건물 목록(좌표 포함)을 받아 브라우저 안에서 이 함수로 고르고, 좌표는 버린다.

const EARTH_RADIUS_M = 6_371_000;

/** 이보다 멀면 가장 가까운 건물을 추천하지 않고 목록에서 고르게 한다. (초안) */
export const NEAREST_MAX_DISTANCE_M = 300;

export type LatLng = { lat: number; lng: number };

/** 두 좌표 사이 거리(미터, 하버사인) */
export function distanceM(a: LatLng, b: LatLng): number {
  if (
    !a ||
    !b ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 가장 가까운 건물. 기준 거리보다 멀거나 건물이 없으면 null */
export function nearestBuilding<B extends LatLng>(
  buildings: B[],
  point: LatLng,
  maxDistanceM = NEAREST_MAX_DISTANCE_M,
): { building: B; distanceM: number } | null {
  if (
    !Array.isArray(buildings) ||
    buildings.length === 0 ||
    !point ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng)
  ) {
    return null;
  }
  let best: { building: B; distanceM: number } | null = null;
  for (const b of buildings) {
    if (!b || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue;
    const d = distanceM(point, b);
    if (!Number.isFinite(d)) continue;
    if (!best || d < best.distanceM) best = { building: b, distanceM: d };
  }
  if (!best || best.distanceM > maxDistanceM) return null;
  return { building: best.building, distanceM: Math.round(best.distanceM) };
}
