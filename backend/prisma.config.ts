import { defineConfig } from "prisma/config";

// .env는 레포 루트에 둔다. 배포 환경에서는 파일 없이 환경 변수로 들어온다.
try {
  process.loadEnvFile("../.env");
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // generate는 DB 없이도 돌아야 해서 env()(없으면 에러) 대신 직접 읽는다.
    url: process.env.DATABASE_URL ?? "",
  },
});
