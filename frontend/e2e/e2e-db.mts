// e2e 전용 DB(chajeumpyo_e2e). 개발 DB와 같은 Docker 컨테이너, 이름만 다르다 (backend 테스트의 chajeumpyo_test와 같은 방식).
// 매 실행 전에: 없으면 만들고 → 마이그레이션 적용 → 모든 테이블 비움. 개발 DB(chajeumpyo)는 절대 건드리지 않는다.
// 직접 실행: npx tsx frontend/e2e/e2e-db.mts
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const E2E_DB_NAME = "chajeumpyo_e2e";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BACKEND = fileURLToPath(new URL("../../backend", import.meta.url));

function baseUrl(): URL {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(`${ROOT}.env`);
    } catch {
      // 아래에서 안내
    }
  }
  if (!process.env.DATABASE_URL) throw new Error("루트 .env에 DATABASE_URL을 넣어 주세요.");
  return new URL(process.env.DATABASE_URL);
}

export function e2eDatabaseUrl(): string {
  const url = baseUrl();
  url.pathname = `/${E2E_DB_NAME}`;
  return url.toString();
}

const TABLES = [
  "notification",
  "pickup",
  "reveal_log",
  "match_attempt",
  "lost_report",
  "found_item_detail",
  "found_item",
  "email_verification",
  "user",
  "storage_place",
  "building",
];

export async function prepareE2eDb(): Promise<string> {
  const url = e2eDatabaseUrl();
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [E2E_DB_NAME]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${E2E_DB_NAME}"`);
  await admin.end();

  execSync("npx prisma migrate deploy", { cwd: BACKEND, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const { rows } = await db.query<{ db: string }>("SELECT current_database() AS db");
  // 이름을 다시 확인한 뒤에만 비운다
  if (rows[0]?.db !== E2E_DB_NAME) throw new Error(`e2e DB가 아니에요: ${rows[0]?.db}`);
  await db.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.end();
  return url;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`준비됨: ${E2E_DB_NAME}`, (await prepareE2eDb()).replace(/:[^:@/]+@/, ":***@"));
}
