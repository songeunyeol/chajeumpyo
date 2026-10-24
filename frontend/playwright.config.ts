import { defineConfig, devices } from "@playwright/test";

// 실서버 e2e: 새 API(4200, e2e 전용 DB chajeumpyo_e2e) + Vite 개발 서버(5174).
// 개발용 4100·5173과 겹치지 않는 포트를 써서 다른 작업의 서버와 같이 돌 수 있다.
// 실행: npm run e2e -w frontend   (Docker DB가 떠 있어야 함: npm run db:up)
const API_PORT = Number(process.env.E2E_API_PORT ?? 4200);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts/test-results",
  // 같은 DB를 쓰므로 순서대로
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "./e2e/.artifacts/report", open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    ...devices["Pixel 7"],
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // 준비 확인용 포트(API+1)는 시드가 끝나야 열린다
      command: "npx tsx e2e/start-api.mts",
      url: `http://localhost:${API_PORT + 1}`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_PORT: String(WEB_PORT) },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        VITE_API_BASE: `http://localhost:${API_PORT}/api/v1`,
        VITE_USE_MOCKS: "false",
        VITE_TURNSTILE_SITE_KEY: "",
      },
    },
  ],
});
