/** 백엔드 API 주소. 연결 작업(src/api, lib/http)이 이 값을 쓴다. */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:4100/api/v1";
/** Cloudflare Turnstile 사이트 키. 비면 개발용 통과 토큰 */
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
/** 네이버 지도 JS v3 클라이언트 ID. 비면 건물 목록으로 대체 */
export const NAVER_MAP_CLIENT_ID: string = import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? "";
/** 화면 확인용 가짜 데이터 사용 여부 (src/data/index.ts가 고른다) */
export const USE_MOCKS: boolean = import.meta.env.VITE_USE_MOCKS === "true";
