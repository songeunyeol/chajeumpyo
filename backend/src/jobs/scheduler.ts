import { logger } from "../lib/logger";
import { cleanupExpiredDemoAccounts } from "./demo-cleanup";

const HOUR = 3600_000;

type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

const jobs: Job[] = [{ name: "체험 계정 정리", everyMs: HOUR, run: cleanupExpiredDemoAccounts }];

/** 서버가 켜져 있는 동안 정기 작업을 돌린다. 서버 시작 직후 한 번 바로 실행한다. */
export function startScheduler() {
  for (const job of jobs) {
    const tick = () =>
      job
        .run()
        .then((result) => logger.info({ job: job.name, result }, "정기 작업 완료"))
        .catch((err) => logger.error({ err, job: job.name }, "정기 작업 실패"));
    void tick();
    setInterval(tick, job.everyMs).unref();
  }
}
