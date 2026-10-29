import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { TEST_DATABASE_URL } from "./test-db";

/** 테스트 DB가 없으면 만들고 마이그레이션을 적용한다. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(`테스트 DB에 연결하지 못했어요. npm run db:up으로 DB를 먼저 띄워 주세요. (${String(err)})`);
  }
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  execSync("npx prisma migrate deploy", {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
