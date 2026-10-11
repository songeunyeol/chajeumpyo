import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

createApp().listen(env.PORT, () => {
  logger.info(`찾음표 API: http://localhost:${env.PORT}  (문서: /api/docs, AI_MODE=${env.AI_MODE})`);
});
