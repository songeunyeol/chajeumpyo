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
    "img-src": ["'self'", "data:", "blob:", ...naverMap],
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

export function createFrontendRouter(dir = env.FRONTEND_DIR ?? defaultDir) {
  const router = Router();
  router.use((req, _res, next) => {
    if (isHidden(req.path)) return next("router");
    next();
  });
  router.use(
    pageCsp,
    express.static(dir, {
      index: "index.html",
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
