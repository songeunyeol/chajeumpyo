import { createHash } from "node:crypto";
import {
  type CreateLostReportRequest,
  LostReportExtraction,
  type LostReportListResponse,
  type LostReportWithCandidates,
  type Role,
  type UpdateLostReportRequest,
} from "@chajeumpyo/shared";
import { ai } from "../ai";
import { env } from "../config/env";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { findCandidates, publicCandidates, recordExposure } from "../matching/candidates";
import { setLostReportEmbedding } from "../repositories/embedding";
import { isValidEmbedding } from "./found-items";

type Viewer = { userId: string; role: Role };

/** 설명이 바뀌었는지 판단하는 해시. 공백 차이는 무시한다 (open-issues #8, #22) */
export function descriptionHash(description: string): string {
  return createHash("sha256").update(description.replace(/\s+/g, " ").trim()).digest("hex");
}

/** 설명 추출 + 임베딩. 응답 형식(고정 계약)도 다시 검증한다. 실패하면 저장하지 않고 502 (open-issues #5) */
async function analyzeDescription(
  description: string,
): Promise<{ extraction: LostReportExtraction; embedding: number[] }> {
  try {
    const raw = await retryOnce(() => withTimeout(ai.extractLostReport(description), env.AI_TIMEOUT_MS, "신고 추출"));
    const extraction = LostReportExtraction.parse(raw);
    const embedding = await retryOnce(() => withTimeout(ai.embed(extraction.description), env.AI_TIMEOUT_MS, "임베딩"));
    if (!isValidEmbedding(embedding as unknown)) throw new Error("임베딩 형식 오류");
    return { extraction, embedding };
  } catch (err) {
    logger.warn({ err }, "분실 신고 AI 분석 실패");
    throw new AppError("AI_UNAVAILABLE", "지금은 설명을 분석할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
}

/** 본인 신고만. 남의 신고는 있는지조차 알려주지 않는다(404). */
async function getOwnReport(id: string, userId: string) {
  const report = await prisma.lostReport.findFirst({ where: { id, userId } });
  if (!report) throw new AppError("NOT_FOUND", "신고를 찾을 수 없어요.");
  return report;
}

async function withCandidates(
  report: Awaited<ReturnType<typeof getOwnReport>>,
  role: Role,
): Promise<LostReportWithCandidates> {
  const candidates = await findCandidates(report, role);
  // 보여 준 후보를 남겨, 나중에 상위에서 밀려나도 판정을 요청할 수 있게 한다
  await recordExposure(
    report.id,
    candidates.map((c) => c.foundItemId),
  );
  return { id: report.id, status: report.status, candidates: await publicCandidates(candidates) };
}

/** POST /lost-reports (F-06, F-07) */
export async function createLostReport(
  viewer: Viewer,
  input: CreateLostReportRequest,
): Promise<LostReportWithCandidates> {
  if (input.buildingId && !(await prisma.building.findUnique({ where: { id: input.buildingId } }))) {
    throw new AppError("VALIDATION_ERROR", "건물을 다시 골라 주세요.", [{ path: "buildingId", message: "없는 건물" }]);
  }
  const { extraction, embedding } = await analyzeDescription(input.description);

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.lostReport.create({
      data: {
        userId: viewer.userId,
        category: input.category,
        lostFrom: new Date(input.lostFrom),
        lostTo: new Date(input.lostTo),
        buildingId: input.buildingId ?? null,
        description: input.description,
        descriptionHash: descriptionHash(input.description),
        extractedAttributes: extraction,
      },
    });
    await setLostReportEmbedding(created.id, embedding, tx);
    return created;
  });
  return withCandidates(report, viewer.role);
}

/** GET /lost-reports: 내 신고 목록 */
export async function listLostReports(viewer: Viewer): Promise<LostReportListResponse> {
  const reports = await prisma.lostReport.findMany({
    where: { userId: viewer.userId },
    include: { building: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const counts = await Promise.all(reports.map((r) => findCandidates(r, viewer.role).then((c) => c.length)));
  return {
    reports: reports.map((r, i) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      description: r.description,
      lostFrom: r.lostFrom.toISOString(),
      lostTo: r.lostTo.toISOString(),
      building: r.building,
      candidateCount: counts[i] ?? 0,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** GET /lost-reports/:id/candidates */
export async function getCandidates(viewer: Viewer, reportId: string) {
  const report = await getOwnReport(reportId, viewer.userId);
  return { candidates: (await withCandidates(report, viewer.role)).candidates };
}

/** PATCH /lost-reports/:id: 닫기 또는 설명 고치기 (#8) */
export async function updateLostReport(
  viewer: Viewer,
  reportId: string,
  input: UpdateLostReportRequest,
): Promise<LostReportWithCandidates> {
  const report = await getOwnReport(reportId, viewer.userId);
  if (report.status !== "OPEN") throw new AppError("VALIDATION_ERROR", "이미 닫힌 신고예요.");

  let updated = report;
  if (input.description !== undefined && descriptionHash(input.description) !== report.descriptionHash) {
    const { extraction, embedding } = await analyzeDescription(input.description);
    updated = await prisma.$transaction(async (tx) => {
      const u = await tx.lostReport.update({
        where: { id: report.id },
        data: {
          description: input.description,
          descriptionHash: descriptionHash(input.description as string),
          extractedAttributes: extraction,
        },
      });
      await setLostReportEmbedding(u.id, embedding, tx);
      return u;
    });
  }
  if (input.status === "CLOSED") {
    updated = await prisma.lostReport.update({ where: { id: report.id }, data: { status: "CLOSED" } });
  }
  return withCandidates(updated, viewer.role);
}
