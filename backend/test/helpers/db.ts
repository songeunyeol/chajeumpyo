import { prisma } from "../../src/lib/prisma";

const TABLES = [
  "notification",
  "candidate_exposure",
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

/** 모든 테이블을 비운다. 통합 테스트의 beforeEach에서 쓴다. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export { prisma };
