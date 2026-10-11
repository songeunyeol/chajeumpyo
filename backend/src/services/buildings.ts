import type { BuildingSummary, NearestBuildingResponse, StoragePlaceItem } from "@chajeumpyo/shared";
import { distanceM } from "../lib/geo";
import { prisma } from "../lib/prisma";

/** 이보다 멀면 가장 가까운 건물을 추천하지 않는다. (초안) */
export const NEAREST_MAX_DISTANCE_M = 300;

export async function listBuildings(): Promise<BuildingSummary[]> {
  return prisma.building.findMany({
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function pickNearest(
  buildings: { id: number; name: string; lat: number; lng: number }[],
  point: { lat: number; lng: number },
): NearestBuildingResponse {
  let best: { building: BuildingSummary; distanceM: number } | null = null;
  for (const b of buildings) {
    const d = distanceM(point, b);
    if (!best || d < best.distanceM) best = { building: { id: b.id, name: b.name }, distanceM: d };
  }
  if (!best || best.distanceM > NEAREST_MAX_DISTANCE_M) return { building: null, distanceM: null };
  return { building: best.building, distanceM: Math.round(best.distanceM) };
}

export async function findNearestBuilding(point: { lat: number; lng: number }): Promise<NearestBuildingResponse> {
  // 브라우저 좌표는 추천 계산에만 쓰고 저장·로그하지 않는다.
  const buildings = await prisma.building.findMany({ select: { id: true, name: true, lat: true, lng: true } });
  return pickNearest(buildings, point);
}

export async function listStoragePlaces(buildingId?: number): Promise<StoragePlaceItem[]> {
  const places = await prisma.storagePlace.findMany({
    where: { isActive: true },
    include: { building: { select: { id: true, name: true } } },
    orderBy: [{ building: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const items = places.map((p) => ({
    id: p.id,
    name: p.name,
    building: p.building,
    org: p.org,
    guideText: p.guideText,
    sameBuilding: p.buildingId === buildingId,
  }));
  // 같은 건물 보관처를 앞으로 (F-01)
  return items.sort((a, b) => Number(b.sameBuilding) - Number(a.sameBuilding));
}
