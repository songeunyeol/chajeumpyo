import { Building2 } from "lucide-react";
import { BandHeader, Screen } from "@/components/layout/screen";
import { MapCard } from "@/components/map/map-card";
import { Skeleton } from "@/components/ui/misc";
import { useBuildings } from "@/data";

/** C-07 캠퍼스 지도: 건물 핀만. 지도를 못 쓰면 건물 이름 목록 */
export function MapPage() {
  const q = useBuildings();
  const list = q.data?.buildings ?? [];
  return (
    <Screen flow="lost" header={<BandHeader variant="lost" title="캠퍼스 지도" back />}>
      {q.isPending ? (
        <Skeleton className="aspect-square w-full rounded-lg" />
      ) : (
        <MapCard
          label="캠퍼스 건물 지도"
          buildings={list}
          className="aspect-square w-full"
          fallback={
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {list.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-card px-4 py-3 font-semibold"
                >
                  <Building2 className="size-5 text-brand" aria-hidden />
                  {b.name}
                </li>
              ))}
            </ul>
          }
        />
      )}
      <p className="m-0 text-caption text-ink-subtle">지도에는 건물 위치만 보여요.</p>
    </Screen>
  );
}
