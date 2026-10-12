import type { BuildingListItem, StoragePlaceItem } from "@chajeumpyo/shared";
import { prisma } from "../lib/prisma";

/** 건물 목록. 좌표를 함께 줘서 가장 가까운 건물은 프론트가 고른다. 서버는 사용자 좌표를 받지 않는다 (#34) */
export async function listBuildings(): Promise<BuildingListItem[]> {
  return prisma.building.findMany({
    select: { id: true, name: true, lat: true, lng: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
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
