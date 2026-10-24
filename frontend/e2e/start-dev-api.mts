// 개발용 API(기본 4100)를 이 작업 폴더(worktree)에서 띄운다. 개발 DB는 다른 폴더의 서버와 같이 쓴다.
// 사진 파일은 DB가 아니라 STORAGE_LOCAL_DIR에 있으므로, 다른 폴더의 서버가 올린 사진까지 보이려면
// 그 폴더의 uploads 절대 경로를 STORAGE_LOCAL_DIR로 넘긴다 (상대 경로는 이 폴더의 backend 기준이라 다른 사진이 404).
//   STORAGE_LOCAL_DIR=/절대/경로/backend/uploads npx tsx frontend/e2e/start-dev-api.mts
// 사진 링크 주소(PUBLIC_BASE_URL)는 늘 이 서버 포트로 맞춘다 — 셸이나 .env의 다른 값(예: :4000)을 쓰지 않는다.
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.DEV_API_PORT ?? 4100);
const storage = process.env.STORAGE_LOCAL_DIR;
if (storage && !isAbsolute(storage)) {
  console.error(`STORAGE_LOCAL_DIR는 절대 경로로 주세요: ${storage}`);
  process.exit(1);
}

const env = {
  ...process.env,
  PORT: String(port),
  CORS_ORIGIN: process.env.DEV_CORS_ORIGIN ?? "http://localhost:5173",
  PUBLIC_BASE_URL: `http://localhost:${port}`,
};
console.log(`개발 API: http://localhost:${port}  사진 폴더: ${storage ?? "이 폴더의 backend/uploads (기본)"}`);

const server = spawn(process.execPath, ["--import", "tsx", "--env-file-if-exists=../.env", "src/server.ts"], {
  cwd: fileURLToPath(new URL("../../backend", import.meta.url)),
  env,
  stdio: "inherit",
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
