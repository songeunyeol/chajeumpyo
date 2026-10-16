import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { corsOrigins, env } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFound } from "./middlewares/error";
import { buildOpenApiDocument } from "./openapi/document";
import { createApiRouter } from "./routes";
import { createFilesRouter } from "./routes/files";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // 배포 환경 프록시 뒤에서 IP 기반 등록 제한이 동작하도록
  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: "100kb" }));
  if (env.NODE_ENV !== "test") app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // API 문서는 개발용. production에서는 API_DOCS_ENABLED=true일 때만 연다.
  if (env.NODE_ENV !== "production" || env.API_DOCS_ENABLED) {
    const openapi = buildOpenApiDocument();
    app.get("/api/openapi.json", (_req, res) => {
      res.json(openapi);
    });
    app.use("/api/docs", helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapi));
  }

  app.use("/api/v1", createApiRouter());
  app.use(createFilesRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
