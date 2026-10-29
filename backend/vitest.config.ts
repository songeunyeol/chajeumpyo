import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/helpers/test-db";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/helpers/global-setup.ts"],
    // 통합 테스트가 같은 DB를 비우고 채우므로 파일을 순서대로 돌린다.
    fileParallelism: false,
    // 기본 5초는 사진 축소·가리기가 느린 컴퓨터에서 끊긴다. 판정이 느려진 건 아니다.
    testTimeout: 15_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret-test-secret-test-secret",
      AI_MODE: "mock",
      MAIL_MODE: "memory",
      ALLOWED_EMAIL_DOMAINS: "skuniv.ac.kr",
      STORAGE_LOCAL_DIR: join(tmpdir(), "chajeumpyo-test-uploads"),
      PUBLIC_BASE_URL: "http://test.local",
    },
  },
});
