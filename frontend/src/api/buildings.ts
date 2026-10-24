import { BuildingListResponse, StoragePlaceListResponse } from "@chajeumpyo/shared";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/http";
import { qk } from "./keys";

// F-02 건물·보관처 고르기, L-04 건물 선택, C-07 지도 카드. 로그인 없이 쓴다

/** 건물 목록(중심 좌표 포함). 좌표는 브라우저 안에서 가까운 건물을 고르는 데만 쓴다 */
export function useBuildings() {
  return useQuery({
    queryKey: qk.buildings,
    queryFn: ({ signal }) => request("/buildings", { schema: BuildingListResponse, signal }),
    staleTime: 60 * 60_000,
  });
}

/** 보관처 목록. buildingId를 주면 같은 건물 보관처가 앞에 온다(sameBuilding) */
export function useStoragePlaces(buildingId?: number) {
  return useQuery({
    queryKey: qk.storagePlaces(buildingId),
    queryFn: ({ signal }) =>
      request("/storage-places", { query: { buildingId }, schema: StoragePlaceListResponse, signal }),
    staleTime: 60 * 60_000,
  });
}
