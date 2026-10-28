/*
 * 찾음표 서비스 워커.
 *
 * 원칙: 앱 껍데기(아래 SHELL 목록)만 캐시한다.
 * - SHELL에 있는 정적 파일 → 캐시 우선.
 * - 페이지 이동(navigate) → 네트워크 우선, 실패하면 캐시된 페이지, 그것도 없으면 offline.html.
 * - /api/ 요청, 쿼리스트링이 붙은 요청(서명 URL), 목록에 없는 파일, 다른 출처 요청(글꼴 CDN, Turnstile)
 *   → 전혀 건드리지 않는다. API 응답과 사진은 개인정보라 절대 캐시하지 않는다.
 *
 * 배포 때 SHELL 파일이 바뀌면 VERSION을 올린다. 그러면 새 캐시를 받고 옛 캐시는 지운다.
 */
const VERSION = "v3";
const CACHE = `chajeumpyo-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/palette.css",
  "/paper.svg",
  "/leaf-white.png",
  "/manifest.webmanifest",
  "/pwa.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/found/api.js",
  "/found/captcha.js",
  "/found/consent.html",
  "/found/photo.html",
  "/found/uploading.html",
  "/found/register.html",
  "/found/board.html",
  "/found/done-handover.html",
  "/found/done-inplace.html",
];
const SHELL_SET = new Set(SHELL);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // HTTP 캐시를 거치지 않고 서버에서 새로 받는다.
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("chajeumpyo-") && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 캐시하면 안 되는 요청인가 (API, 서명 URL 등) */
function isPrivate(url) {
  return url.pathname.startsWith("/api/") || url.search !== "";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 다른 출처(글꼴 CDN, Turnstile, 개발용 :4000 API)는 브라우저에 맡긴다.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    if (url.pathname.startsWith("/api/")) return;
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        // 페이지는 쿼리스트링(?id= 등)을 무시하고 껍데기를 찾는다.
        return (
          (await cache.match(url.pathname)) ||
          (url.pathname.endsWith("/") ? await cache.match(`${url.pathname}index.html`) : undefined) ||
          (await cache.match(OFFLINE_URL))
        );
      }),
    );
    return;
  }

  if (isPrivate(url) || !SHELL_SET.has(url.pathname)) return;

  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(url.pathname))
      .then((hit) => hit || fetch(req)),
  );
});
