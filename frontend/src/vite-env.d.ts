/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_NAVER_MAP_CLIENT_ID?: string;
  readonly VITE_USE_MOCKS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
