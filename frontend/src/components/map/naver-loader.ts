/**
 * 네이버 지도 JS v3를 필요할 때 한 번만 불러온다.
 * 키가 없거나, 인증 실패(window.navermap_authFailure)거나, 3초 안에 안 뜨면 실패 → 화면은 건물 목록으로 대체.
 * 오류 내용은 개발자 콘솔에만 남긴다.
 */

/** 이 앱이 쓰는 만큼만 적은 타입 */
export type NaverLatLng = object;
export type NaverMap = {
  setCenter(c: NaverLatLng): void;
  setZoom(z: number): void;
  fitBounds(b: object, margin?: object): void;
  destroy?(): void;
};
export type NaverMarker = { setMap(m: NaverMap | null): void; setIcon(icon: object): void };
export type NaverMaps = {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  LatLngBounds: new (sw: NaverLatLng, ne: NaverLatLng) => object & { extend(p: NaverLatLng): void };
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => NaverMap;
  Marker: new (opts: Record<string, unknown>) => NaverMarker;
  Point: new (x: number, y: number) => object;
  Event: { addListener(target: object, name: string, fn: () => void): unknown };
};

declare global {
  interface Window {
    naver?: { maps?: NaverMaps };
    navermap_authFailure?: () => void;
  }
}

export const MAP_TIMEOUT_MS = 3000;
export const naverScriptUrl = (clientId: string) =>
  `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;

let pending: Promise<NaverMaps> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** 불러온 뒤에 인증 실패가 와도(키·도메인 문제) 지도를 목록으로 바꾸게 알린다 */
export function onNaverAuthFailure(cb: () => void): () => void {
  if (authFailed) cb();
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

/** 테스트용: 다음 호출이 처음부터 다시 불러오게 */
export function resetNaverLoader() {
  pending = null;
  authFailed = false;
  authListeners.clear();
}

export function loadNaverMaps(clientId: string, timeoutMs = MAP_TIMEOUT_MS): Promise<NaverMaps> {
  if (!clientId) return Promise.reject(new Error("VITE_NAVER_MAP_CLIENT_ID 없음"));
  if (authFailed) return Promise.reject(new Error("navermap_authFailure"));
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (pending) return pending;
  pending = new Promise<NaverMaps>((resolve, reject) => {
    const fail = (why: string) => {
      console.warn(`[찾음표] 네이버 지도 대신 건물 목록을 보여 줘요: ${why}`);
      pending = null;
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail(`${timeoutMs}ms 안에 불러오지 못함`), timeoutMs);
    window.navermap_authFailure = () => {
      clearTimeout(timer);
      authFailed = true;
      fail("navermap_authFailure (클라이언트 ID·도메인 설정 확인)");
      for (const l of authListeners) l();
    };
    const s = document.createElement("script");
    s.src = naverScriptUrl(clientId);
    s.async = true;
    s.onload = () => {
      clearTimeout(timer);
      if (window.naver?.maps) resolve(window.naver.maps);
      else fail("스크립트는 받았지만 naver.maps가 없음");
    };
    s.onerror = () => {
      clearTimeout(timer);
      fail("스크립트를 받지 못함");
    };
    document.head.appendChild(s);
  });
  return pending;
}
