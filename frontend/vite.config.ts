import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "찾음표",
        short_name: "찾음표",
        description: "사진은 바로 올리고, 특징이 맞아야 위치가 열리는 서경대 분실물 서비스",
        lang: "ko",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F6F2EA",
        theme_color: "#1C4B34",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // 개인정보: API 응답과 서명 URL 사진(/files)은 미리 받지도(precache), 실행 중 캐시하지도(runtimeCaching 없음) 않는다.
        // 미리 받는 것은 빌드 결과물(dist)뿐이다.
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // 관리자 화면·QR 리더(assets/admin/)는 학생 기기에 미리 받지 않는다
        globIgnores: ["**/assets/admin/**", "**/icon.svg", "**/icon-maskable.svg"],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // 관리자 전용 덩어리는 assets/admin/ 아래로 (서비스 워커 precache에서 뺀다)
        chunkFileNames: (chunk) => {
          const adminOnly =
            /\/pages\/admin\//.test(chunk.facadeModuleId ?? "") ||
            chunk.moduleIds.some((id) => /@zxing|layout\/admin-shell|lib\/admin-status/.test(id));
          return adminOnly ? "assets/admin/[name]-[hash].js" : "assets/[name]-[hash].js";
        },
      },
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // 화면 테스트는 가짜 훅(src/data/mock)으로 돈다
    env: { VITE_USE_MOCKS: "true" },
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
