import { describe, expect, it } from "vitest";
import { EnvSchema } from "../../src/config/env";

// production 배포 설정 실수(사진 링크가 http로 나감, 업로드가 볼륨 밖에 쌓임)를 부팅 때 막는다
const base = {
  DATABASE_URL: "postgresql://x",
  JWT_SECRET: "a".repeat(32),
  ALLOWED_EMAIL_DOMAINS: "skuniv.ac.kr",
  CAPTCHA_MODE: "turnstile",
  TURNSTILE_SECRET_KEY: "secret",
  TURNSTILE_SITE_KEY: "site",
};
const prod = {
  ...base,
  NODE_ENV: "production",
  PUBLIC_BASE_URL: "https://example.test",
  STORAGE_LOCAL_DIR: "/data/uploads",
};

function issuePaths(input: Record<string, string>) {
  const r = EnvSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
}

describe("production 설정 규칙", () => {
  it("https 주소와 절대 경로면 통과한다", () => {
    expect(issuePaths(prod)).toEqual([]);
  });

  it("PUBLIC_BASE_URL이 https://로 시작하지 않으면 설정 오류", () => {
    expect(issuePaths({ ...prod, PUBLIC_BASE_URL: "http://example.test" })).toContain("PUBLIC_BASE_URL");
    expect(issuePaths({ ...prod, PUBLIC_BASE_URL: "example.test" })).toContain("PUBLIC_BASE_URL");
    // 기본값(http://localhost:4000) 그대로 배포하는 실수
    const { PUBLIC_BASE_URL: _url, ...noUrl } = prod;
    expect(issuePaths(noUrl)).toContain("PUBLIC_BASE_URL");
  });

  it("STORAGE_LOCAL_DIR가 상대 경로면 설정 오류", () => {
    expect(issuePaths({ ...prod, STORAGE_LOCAL_DIR: "uploads" })).toContain("STORAGE_LOCAL_DIR");
    expect(issuePaths({ ...prod, STORAGE_LOCAL_DIR: "./data/uploads" })).toContain("STORAGE_LOCAL_DIR");
    const { STORAGE_LOCAL_DIR: _dir, ...noDir } = prod;
    expect(issuePaths(noDir)).toContain("STORAGE_LOCAL_DIR");
  });

  it("개발·테스트에서는 http 주소와 상대 경로를 그대로 쓴다", () => {
    expect(issuePaths({ ...base, NODE_ENV: "development" })).toEqual([]);
    expect(issuePaths({ ...base, NODE_ENV: "test", PUBLIC_BASE_URL: "http://localhost:4000" })).toEqual([]);
  });
});
