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

/** 화면에 필요한 바깥 리소스만 연다. 화면이 인라인 <script>·style을 써서 unsafe-inline이 필요하다 */
const pageCsp = helmet.contentSecurityPolicy({
  directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'"],
    "frame-src": ["https://challenges.cloudflare.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  },
});

/** 개발용 파일(_tester.html 같은 _로 시작하는 파일)과 작업 메모(.md)는 배포에서 내려주지 않는다 */
function isHidden(path: string) {
  let name = basename(path);
  try {
    name = decodeURIComponent(name);
  } catch {}
  return name.startsWith("_") || extname(name).toLowerCase() === ".md";
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
