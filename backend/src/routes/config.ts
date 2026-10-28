import { PublicConfigResponse } from "@chajeumpyo/shared";
import { Router } from "express";
import { env } from "../config/env";
import { registry } from "../openapi/registry";

registry.registerPath({
  method: "get",
  path: "/config",
  tags: ["설정"],
  summary: "프론트 공개 설정 (캡차)",
  description: [
    "캡차 방식과 Turnstile 사이트 키를 준다. 프론트는 mode가 turnstile일 때만 위젯 스크립트를 불러오고,",
    "받은 토큰을 X-Captcha-Token 헤더로 보낸다. off(개발)면 siteKey는 null이고 토큰 검사를 하지 않는다.",
    "비밀 키는 내려 주지 않는다.",
  ].join(" "),
  responses: {
    200: { description: "공개 설정", content: { "application/json": { schema: PublicConfigResponse } } },
  },
});

export function createConfigRouter() {
  const router = Router();

  router.get("/config", (_req, res) => {
    const turnstile = env.CAPTCHA_MODE === "turnstile";
    const body: PublicConfigResponse = {
      captcha: { mode: env.CAPTCHA_MODE, siteKey: turnstile ? (env.TURNSTILE_SITE_KEY ?? null) : null },
    };
    // 배포 중 키를 바꾸면 곧 반영되게 짧게만 캐시한다
    res.set("Cache-Control", "public, max-age=60");
    res.json(body);
  });

  return router;
}
