import type { BuildingListItem } from "@chajeumpyo/shared";
import { Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { NAVER_MAP_CLIENT_ID } from "@/lib/env";
import { cn } from "@/lib/utils";

// 지도 코드는 따로 받는다(지도를 쓰는 화면에서만)
const BuildingMap = lazy(() => import("./building-map"));

export type MapState = "loading" | "ready" | "failed";

/** 키가 있으면 지도를 시도. 키가 없으면 처음부터 실패로 본다 */
export const mapAvailable = () => NAVER_MAP_CLIENT_ID !== "";

function MapLoading({ note }: { note?: boolean }) {
  return (
    <span
      role="status"
      aria-label="지도를 불러오는 중"
      className="flex size-full items-center justify-center bg-surface-sunken text-ink-subtle"
    >
      <MapIcon className="size-8" aria-hidden />
      {note && <span className="sr-only">지도는 3초 안에 안 뜨면 건물 이름만 보여 줘요.</span>}
    </span>
  );
}

/**
 * C-07 공용 지도 카드. 건물 핀만(분실물 좌표·사용자 위치 없음).
 * 지도를 못 쓰면 fallback(건물 목록 등)을 그린다.
 */
export function MapCard({
  buildings,
  selectedId,
  onSelect,
  interactive = true,
  fallback,
  className,
  label,
  onState,
  inline,
}: {
  buildings: BuildingListItem[];
  selectedId?: number;
  onSelect?: (id: number) => void;
  interactive?: boolean;
  fallback: React.ReactNode;
  className?: string;
  label: string;
  onState?: (s: MapState) => void;
  /** 버튼 안에 넣을 때: 영역(section) 대신 span */
  inline?: boolean;
}) {
  const [state, setState] = useState<MapState>(() => (mapAvailable() ? "loading" : "failed"));
  const set = (s: MapState) => {
    setState(s);
    onState?.(s);
  };
  if (state === "failed" || buildings.length === 0) return <>{fallback}</>;
  const Box = inline ? "span" : "section";
  return (
    <Box
      aria-label={inline ? undefined : label}
      className={cn("relative block overflow-hidden rounded-lg border border-line bg-surface-sunken", className)}
    >
      <Suspense fallback={<MapLoading note />}>
        <BuildingMap
          buildings={buildings}
          selectedId={selectedId}
          onSelect={onSelect}
          interactive={interactive}
          onReady={() => set("ready")}
          onFail={() => set("failed")}
        />
      </Suspense>
      {state === "loading" && (
        <span className="absolute inset-0">
          <MapLoading note />
        </span>
      )}
    </Box>
  );
}
