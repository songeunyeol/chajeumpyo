import { EMBEDDING_DIM } from "../ai/types";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

type Db = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

// Prisma는 vector 타입을 읽고 쓰지 못해(Unsupported) 임베딩만 이 파일에서 raw SQL로 다룬다.

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`임베딩 차원이 ${EMBEDDING_DIM}이 아니에요: ${embedding.length}`);
  }
  return `[${embedding.join(",")}]`;
}

export async function setFoundItemEmbedding(foundItemId: string, embedding: number[], db: Db = prisma) {
  await db.$executeRaw`
    UPDATE found_item_detail SET embedding = ${toVectorLiteral(embedding)}::vector
    WHERE found_item_id = ${foundItemId}::uuid`;
}

export async function setLostReportEmbedding(lostReportId: string, embedding: number[], db: Db = prisma) {
  await db.$executeRaw`
    UPDATE lost_report SET embedding = ${toVectorLiteral(embedding)}::vector
    WHERE id = ${lostReportId}::uuid`;
}

export async function clearLostReportEmbedding(lostReportId: string, db: Db = prisma) {
  await db.$executeRaw`UPDATE lost_report SET embedding = NULL WHERE id = ${lostReportId}::uuid`;
}

/**
 * 신고 임베딩과 습득물 임베딩의 코사인 유사도(0~1).
 * 후보 범위는 호출한 쪽에서 이미 좁혀서 foundItemIds로 넘긴다.
 */
export async function similarityToFoundItems(
  lostReportId: string,
  foundItemIds: string[],
): Promise<Map<string, number>> {
  if (foundItemIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ found_item_id: string; similarity: number }[]>`
    SELECT d.found_item_id, 1 - (d.embedding <=> r.embedding) AS similarity
    FROM found_item_detail d, lost_report r
    WHERE r.id = ${lostReportId}::uuid
      AND d.found_item_id = ANY(${foundItemIds}::uuid[])
      AND d.embedding IS NOT NULL AND r.embedding IS NOT NULL`;
  return new Map(rows.map((r) => [r.found_item_id, Number(r.similarity)]));
}
