import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // 워크스페이스 공유 패키지는 TS 소스 그대로라 번들에 포함한다.
  noExternal: ["@chajeumpyo/shared"],
});
