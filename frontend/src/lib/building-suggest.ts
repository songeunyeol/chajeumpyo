import { type BuildingListItem, type LatLng, nearestBuilding } from "@chajeumpyo/shared";
import exifr from "exifr";

/**
 * F-02 건물 추천 (QA B14): 사진 EXIF GPS → (위치 동의 시) 브라우저 위치 → 직접 선택.
 * 좌표는 이 파일 밖으로 나가지 않는다. 건물로 바꾼 뒤 버리고, 결과에는 건물과 출처만 담는다.
 */
export type SuggestionSource = "exif" | "geolocation" | "manual";

export type BuildingSuggestion = {
  building: BuildingListItem | null;
  source: SuggestionSource;
};

/** 사진의 EXIF GPS. 없거나 못 읽으면 null */
export async function readExifGps(file: Blob): Promise<LatLng | null> {
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // HEIC 등 읽지 못하는 형식이면 다음 단계로
  }
  return null;
}

/** 브라우저 현재 위치. 거부·실패·시간 초과면 null */
export function readGeolocation(timeoutMs = 8000): Promise<LatLng | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

type Deps = {
  readExif: (file: Blob) => Promise<LatLng | null>;
  readGeo: () => Promise<LatLng | null>;
};

const defaultDeps: Deps = { readExif: readExifGps, readGeo: () => readGeolocation() };

/**
 * 건물 추천 순서대로 시도한다. 위치 동의가 없으면 브라우저 위치는 묻지 않는다.
 * 사진 위치가 학교에서 멀면(300m 초과) 다음 단계로 넘어간다.
 */
export async function suggestBuilding(
  file: Blob | null,
  buildings: BuildingListItem[],
  locationConsent: boolean,
  deps: Deps = defaultDeps,
): Promise<BuildingSuggestion> {
  if (buildings.length === 0) return { building: null, source: "manual" };
  if (file) {
    const point = await deps.readExif(file);
    const hit = point ? nearestBuilding(buildings, point) : null;
    if (hit) return { building: hit.building, source: "exif" };
  }
  if (locationConsent) {
    const point = await deps.readGeo();
    const hit = point ? nearestBuilding(buildings, point) : null;
    if (hit) return { building: hit.building, source: "geolocation" };
  }
  return { building: null, source: "manual" };
}

export const SUGGESTION_SOURCE_LABELS: Record<SuggestionSource, string> = {
  exif: "사진 위치로 골랐어요",
  geolocation: "지금 위치로 골랐어요",
  manual: "직접 골라 주세요",
};
