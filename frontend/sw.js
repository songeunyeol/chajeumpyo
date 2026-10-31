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
 *
 * 화면 주소에는 .html이 없다(/found/photo). 서버가 .html 주소를 .html 없는 주소로 넘기므로,
 * 화면은 .html 없는 주소로 저장하고 찾는다. 옛 주소(/found/photo.html)로 와도 같은 칸을 찾는다.
 */
const VERSION = "v66";
const CACHE = `chajeumpyo-shell-${VERSION}`;
const OFFLINE_URL = "/offline";

const SHELL = [
  "/",
  "/offline",
  "/palette.css",
  "/paper.svg",
  "/leaf-white.png",
  "/campus-map.png",
  "/naver-map.js",
  "/manifest.webmanifest",
  "/pwa.js",
  "/leave-guard.js",
  "/modal-back.js",
  "/offline-notice.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/found/api.js",
  "/found/captcha.js",
  "/found/heic.js",
  "/found/consent",
  "/found/photo",
  "/found/uploading",
  "/found/register",
  "/found/board",
  "/found/done-handover",
  "/found/done-inplace",
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
        // 페이지는 쿼리스트링(?id= 등)을 무시하고 껍데기를 찾는다. 옛 .html 주소·index.html도 같은 칸으로
        const page = url.pathname.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
        return (await cache.match(page)) || (await cache.match(OFFLINE_URL));
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
