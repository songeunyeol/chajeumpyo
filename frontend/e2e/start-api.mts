// e2e용 API 서버: e2e DB를 비우고 → 새 API 프로세스를 띄우고 → 개발용 더미 데이터를 넣는다.
// playwright.config.ts의 webServer가 이 스크립트를 실행한다. 요청 제한 카운터(메모리)도 매번 새로 시작한다.
// 서버 로그(가입 인증 코드 포함)는 e2e/.artifacts/api.log에 쌓인다.
import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareE2eDb } from "./e2e-db.mts";

export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4200);
export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);

const BACKEND = fileURLToPath(new URL("../../backend", import.meta.url));
const ARTIFACTS = fileURLToPath(new URL("./.artifacts", import.meta.url));
mkdirSync(ARTIFACTS, { recursive: true });
const log = createWriteStream(join(ARTIFACTS, "api.log"), { flags: "w" });

const databaseUrl = await prepareE2eDb();
const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  PORT: String(E2E_API_PORT),
  CORS_ORIGIN: `http://localhost:${E2E_WEB_PORT}`,
  PUBLIC_BASE_URL: `http://localhost:${E2E_API_PORT}`,
  AI_MODE: "mock",
  MAIL_MODE: "console",
  CAPTCHA_MODE: "off",
  STORAGE_LOCAL_DIR: join(tmpdir(), "chajeumpyo-e2e-uploads"),
};

const tsx = (args: string[]): ChildProcess =>
  spawn("npx", ["tsx", "--env-file-if-exists=../.env", ...args], {
    cwd: BACKEND,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

const server = tsx(["src/server.ts"]);
server.stdout?.pipe(log);
server.stderr?.pipe(log);
const stop = () => {
  server.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  console.error(`e2e API가 멈췄어요 (code ${code}). 로그: ${join(ARTIFACTS, "api.log")}`);
  process.exit(1);
});

const health = `http://localhost:${E2E_API_PORT}/health`;
for (let i = 0; ; i++) {
  try {
    if ((await fetch(health)).ok) break;
  } catch {
    // 아직 안 뜸
  }
  if (i > 120) throw new Error("e2e API가 60초 안에 뜨지 않았어요");
  await new Promise((r) => setTimeout(r, 500));
}

await new Promise<void>((resolve, reject) => {
  const seed = tsx(["scripts/seed-dev.ts"]);
  seed.stdout?.pipe(log, { end: false });
  seed.stderr?.pipe(log, { end: false });
  seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`시드 실패 (code ${code})`))));
});

// playwright가 이 주소로 준비 완료를 확인한다 (시드가 끝난 뒤에만 열림)
const { createServer } = await import("node:http");
createServer((_req, res) => res.end("ready")).listen(E2E_API_PORT + 1);
console.log(`e2e API 준비됨: http://localhost:${E2E_API_PORT}`);
