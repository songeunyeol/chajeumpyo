import type { BuildingListItem, BuildingSummary, StoragePlaceSummary } from "@chajeumpyo/shared";
import { Building2, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useBuildings } from "@/data";
import { MapCard, type MapState, mapAvailable } from "./map-card";

/**
 * 지도에 꽂을 건물 하나. 보관처면 보관처가 있는 건물(안내 문구·이름에 든 건물 이름), 못 찾으면 물건의 건물.
 * 좌표는 언제나 건물 좌표(GET /buildings)만 쓴다.
 */
export function mapBuildingFor(
  building: BuildingSummary,
  storagePlace: StoragePlaceSummary | null,
  list: BuildingListItem[],
): BuildingListItem | undefined {
  if (storagePlace) {
    const text = `${storagePlace.guideText} ${storagePlace.name}`;
    const byText = [...list].sort((a, b) => b.name.length - a.name.length).find((b) => text.includes(b.name));
    if (byText) return byText;
  }
  return list.find((b) => b.id === building.id);
}

/** 네이버 지도에서 찾기(건물 이름으로). 좌표를 주소에 싣지 않는다 */
export const naverSearchUrl = (name: string) =>
  `https://map.naver.com/p/search/${encodeURIComponent(`서경대학교 ${name}`)}`;

/** C-07 L-10 작은 지도: 움직이지 않는 카드, 누르면 확대 시트. 못 쓰면 건물 이름만 */
export function PlaceMap({
  building,
  storagePlace,
}: {
  building: BuildingSummary;
  storagePlace: StoragePlaceSummary | null;
}) {
  const buildings = useBuildings();
  const [big, setBig] = useState(false);
  const [mapState, setMapState] = useState<MapState>(() => (mapAvailable() ? "loading" : "failed"));
  const target = mapBuildingFor(building, storagePlace, buildings.data?.buildings ?? []);
  const name = target?.name ?? building.name;
  const nameOnly = (
    <p className="m-0 flex items-center gap-2 rounded-lg border border-line bg-surface-card px-4 py-3 text-[15px] font-semibold">
      <Building2 className="size-5 text-brand" aria-hidden />
      {name}
    </p>
  );
  return (
    <div className="flex flex-col gap-2">
      {target && mapState !== "failed" ? (
        <button
          type="button"
          onClick={() => setBig(true)}
          aria-label={`${name} 지도 크게 보기`}
          className="block w-full rounded-lg p-0 text-left"
        >
          <MapCard
            label={`${name} 위치 지도`}
            buildings={[target]}
            selectedId={target.id}
            interactive={false}
            inline
            onState={setMapState}
            className="pointer-events-none aspect-[320/180] w-full"
            fallback={nameOnly}
          />
        </button>
      ) : (
        nameOnly
      )}
      <a
        href={naverSearchUrl(name)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-btn items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-card px-4 font-semibold text-brand"
      >
        <MapIcon className="size-5" aria-hidden />
        네이버 지도에서 길찾기
      </a>
      <p className="m-0 text-caption text-ink-subtle">
        지도에는 건물 위치만 보여요. 물건이 있던 정확한 자리는 표시하지 않아요.
      </p>
      {target && mapState !== "failed" && (
        <Sheet open={big} onOpenChange={setBig} title={name}>
          <MapCard
            label={`${name} 위치 지도 크게`}
            buildings={[target]}
            selectedId={target.id}
            className="aspect-square w-full"
            fallback={nameOnly}
          />
        </Sheet>
      )}
    </div>
  );
}
