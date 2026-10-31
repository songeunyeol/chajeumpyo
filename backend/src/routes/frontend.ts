import { existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import express, { Router } from "express";
import helmet from "helmet";
import { env } from "../config/env";

// 배포에서는 백엔드가 frontend/ 정적 화면도 같이 내려준다. 주소가 하나라 CORS 없이 같은 출처로 API를 부른다.
// src/routes/에서 실행(tsx)하든 번들된 dist/에서 실행하든 레포의 frontend/를 찾는다.
const defaultDir =
  ["../../../frontend", "../../frontend"]
    .map((rel) => resolve(import.meta.dirname, rel))
    .find((dir) => existsSync(resolve(dir, "index.html"))) ?? resolve(import.meta.dirname, "../../frontend");

/** 네이버 지도 SDK(frontend/naver-map.js)가 불러오는 스크립트·지도 타일 출처. 키가 없으면 그림 지도로 대신한다 */
const naverMap = ["https://oapi.map.naver.com", "https://*.map.naver.net", "https://*.pstatic.net"];
/** 네이버 지도 인증이 막힐 때 frontend/naver-map.js가 대신 까는 위성 사진 타일 */
const esriTiles = "https://server.arcgisonline.com";
/**
 * 화면에 필요한 바깥 리소스만 연다. 화면이 인라인 <script>·style을 써서 unsafe-inline이 필요하다.
 * helmet 기본값이 합쳐져 script-src-attr 'none'이 붙으므로 onclick 같은 인라인 속성은 쓰지 않는다(리스너로 단다).
 */
const pageCsp = helmet.contentSecurityPolicy({
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com", ...naverMap],
    "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
    "img-src": ["'self'", "data:", "blob:", esriTiles, ...naverMap],
    "connect-src": ["'self'", ...naverMap],
    "frame-src": ["https://challenges.cloudflare.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  },
});

/** 디자인 확인용 화면. 사용자 화면이 아니라 배포에서 내려주지 않는다 */
const designCheckPages = new Set(["팔레트.html", "한눈에.html"]);

/** 개발용 파일(_tester.html 같은 _로 시작하는 파일), 작업 메모(.md), 디자인 확인 화면은 배포에서 내려주지 않는다 */
function isHidden(path: string) {
  let name = basename(path);
  try {
    name = decodeURIComponent(name);
  } catch {}
  return name.startsWith("_") || extname(name).toLowerCase() === ".md" || designCheckPages.has(name.normalize("NFC"));
}

/**
 * 주소에 .html을 보이지 않는다. 화면 링크는 /lost/login처럼 .html 없이 쓰고(아래 extensions가 login.html을 찾는다),
 * 옛 링크·북마크(/lost/login.html, /index.html)는 .html 없는 주소로 넘긴다. 쿼리(?id=)는 그대로 붙인다.
 * 되돌릴 때 브라우저에 남지 않게 302(임시)로 넘긴다.
 */
function cleanHtmlPath(path: string) {
  if (!path.endsWith(".html")) return null;
  const clean = path.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
  // //evil.com 이나 /\evil.com 처럼 다른 사이트로 읽히는 주소를 만들지 않는다
  return `/${clean.replace(/^[/\\]+/, "")}`;
}

export function createFrontendRouter(dir = env.FRONTEND_DIR ?? defaultDir) {
  const router = Router();
  router.use((req, res, next) => {
    if (isHidden(req.path)) return next("router");
    const clean = req.method === "GET" || req.method === "HEAD" ? cleanHtmlPath(req.path) : null;
    if (clean) {
      const q = req.originalUrl.indexOf("?");
      return res.redirect(302, q < 0 ? clean : clean + req.originalUrl.slice(q));
    }
    next();
  });
  router.use(
    pageCsp,
    express.static(dir, {
      index: "index.html",
      extensions: ["html"],
      dotfiles: "ignore",
      setHeaders(res, path) {
        // 파일 이름에 해시가 없어 화면·스크립트는 매번 새로 확인하고(ETag로 304), 이미지는 하루 둔다
        const ext = extname(path).toLowerCase();
        res.setHeader("Cache-Control", [".html", ".js", ".css"].includes(ext) ? "no-cache" : "public, max-age=86400");
      },
    }),
  );
  return router;
}
