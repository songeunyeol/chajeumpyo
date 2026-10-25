import type { BuildingListItem } from "@chajeumpyo/shared";
import { Map as MapIcon, Search } from "lucide-react";
import { useState } from "react";
import { MapCard, type MapState, mapAvailable } from "@/components/map/map-card";
import { Button } from "@/components/ui/button";
import { OptionList } from "@/components/ui/chips";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { josa } from "@/lib/josa";

/** 건물 직접 고르기 시트: 검색 + 라디오 목록 */
export function BuildingSheet({
  open,
  onOpenChange,
  buildings,
  value,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildings: BuildingListItem[];
  value?: number;
  onPick: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | undefined>(value);
  const [mapState, setMapState] = useState<MapState>(() => (mapAvailable() ? "loading" : "failed"));
  // 지도가 뜨는 중이거나 떴으면 검색 대신 지도. 못 쓰면 한 줄 안내 + 검색 + 목록
  const mapOk = mapState !== "failed" && buildings.length > 0;
  const list = buildings.filter((b) => b.name.includes(q.trim()));
  const picked = buildings.find((b) => b.id === sel);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="어느 건물에서 주웠나요?">
      <MapCard
        label="건물 지도"
        buildings={buildings}
        selectedId={sel}
        onSelect={setSel}
        onState={setMapState}
        className="aspect-[320/260] w-full shrink-0"
        fallback={null}
      />
      {!mapOk && (
        <>
          <p className="m-0 flex items-start gap-2.5 rounded-md bg-surface-sunken px-3.5 py-3 text-[14px] leading-5 text-ink-muted">
            <MapIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
            지도를 불러오지 못해서 건물 목록으로 보여 드려요.
          </p>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <Input
              aria-label="건물 이름 검색"
              placeholder="건물 이름 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-11"
            />
          </div>
        </>
      )}
      {list.length > 0 ? (
        <OptionList
          label="건물"
          value={sel}
          onChange={setSel}
          options={list.map((b) => ({ value: b.id, title: b.name }))}
          className={mapOk ? "max-h-[28dvh] overflow-y-auto" : "max-h-[50dvh] overflow-y-auto"}
        />
      ) : (
        <p className="m-0 py-6 text-center text-ink-muted">‘{q}’ 건물을 찾지 못했어요.</p>
      )}
      <Button disabled={!picked} onClick={() => picked && onPick(picked.id)}>
        {picked ? `${josa(picked.name, "으로/로")} 할게요` : "건물을 골라 주세요"}
      </Button>
    </Sheet>
  );
}
