import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import "../routes"; // 라우트 파일이 registry에 경로를 등록한다
import { registry } from "./registry";

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "찾음표 API",
      version: "0.1.0",
      description: "기준 문서: 03_API명세서.md. 스키마 원본은 packages/shared.",
    },
    servers: [{ url: "/api/v1" }],
  });
}
