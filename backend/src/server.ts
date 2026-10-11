import { createApp } from "./app";
import { env } from "./config/env";
import { startScheduler } from "./jobs/scheduler";
import { logger } from "./lib/logger";

createApp().listen(env.PORT, () => {
  logger.info(
    `찾음표 API: http://localhost:${env.PORT}  (문서: /api/docs, AI_MODE=${env.AI_MODE}, MAIL_MODE=${env.MAIL_MODE})`,
  );
  startScheduler();
});
