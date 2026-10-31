import { createHash } from "node:crypto";
import {
  CATEGORY_LABELS,
  type CreateLostReportRequest,
  LostReportExtraction,
  type LostReportListResponse,
  type LostReportWithCandidates,
  type ReportAiRead,
  type Role,
  type UpdateLostReportRequest,
} from "@chajeumpyo/shared";
import { ai } from "../ai";
import { env } from "../config/env";
import { Prisma } from "../generated/prisma/client";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { findCandidates, publicCandidates, recordExposure } from "../matching/candidates";
import { clearLostReportEmbedding, setLostReportEmbedding } from "../repositories/embedding";
import { isValidEmbedding } from "./found-items";
import { newCandidateMessage } from "./notifications";

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

/** 본인 신고만. 남의 신고는 있는지조차 알려주지 않는다(404). 지운 신고도 404 */
async function getOwnReport(id: string, userId: string) {
  const report = await prisma.lostReport.findFirst({ where: { id, userId, deletedAt: null } });
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
  return {
    id: report.id,
    status: report.status,
    candidates: await publicCandidates(candidates),
    aiRead: aiReadOf(report.extractedAttributes),
  };
}

/** 신고자 본인 설명에서 AI가 읽은 값만 화면용으로 꺼낸다. 형식이 다르면 null */
export function aiReadOf(extracted: unknown): ReportAiRead | null {
  const parsed = LostReportExtraction.safeParse(extracted);
  if (!parsed.success) return null;
  const e = parsed.data;
  return {
    category: e.category,
    subCategory: e.subCategory ?? null,
    color: e.color,
    brand: e.brand,
    features: e.features.map((f) => ({ key: f.key, value: f.value })),
  };
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
  const result = await withCandidates(report, viewer.role);
  if (viewer.role === "DEMO") await addDemoExampleAlert(report, result.candidates[0]?.foundItemId);
  return result;
}

export const DEMO_ALERT_PREFIX = "체험 예시 · ";

/**
 * 체험 계정은 시드 물건이 이미 등록돼 있어 "새 후보" 알림이 생길 일이 없다. 그러면 알림 화면이 비어
 * 심사위원이 알림 기능을 볼 수 없다(QA 10/30). 첫 후보 하나로 예시 알림을 한 번만 만든다.
 * 실제 알림 로직(alertNewCandidate)과 구분되게 앞에 "체험 예시"를 붙인다. 일반 계정에는 만들지 않는다.
 */
async function addDemoExampleAlert(report: { id: string; userId: string }, foundItemId: string | undefined) {
  if (!foundItemId) return;
  try {
    const exists = await prisma.notification.findFirst({
      where: { userId: report.userId, type: "NEW_CANDIDATE" },
      select: { id: true },
    });
    if (exists) return;
    const item = await prisma.foundItem.findUnique({
      where: { id: foundItemId },
      select: { category: true, isSeed: true, building: { select: { name: true } } },
    });
    if (!item?.isSeed || !item.category) return;
    await prisma.notification.create({
      data: {
        userId: report.userId,
        type: "NEW_CANDIDATE",
        foundItemId,
        lostReportId: report.id,
        message: DEMO_ALERT_PREFIX + newCandidateMessage(item.building?.name ?? null, CATEGORY_LABELS[item.category]),
      },
    });
  } catch (err) {
    logger.warn({ err }, "체험 예시 알림 만들기 실패");
  }
}

/** GET /lost-reports: 내 신고 목록 */
export async function listLostReports(viewer: Viewer): Promise<LostReportListResponse> {
  const reports = await prisma.lostReport.findMany({
    where: { userId: viewer.userId, deletedAt: null },
    include: { building: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const counts = await Promise.all(reports.map((r) => findCandidates(r, viewer.role).then((c) => c.length)));
  const pickups = await pickupStates(viewer.userId, reports);
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
      pickup: pickups.get(r.id) ?? null,
    })),
  };
}

type PickupState = LostReportListResponse["reports"][number]["pickup"];

/**
 * 신고마다 확인을 통과한 물건 하나(가장 최근)와 그 물건의 내 수령 상태.
 * 수령 완료는 신고가 RESOLVED이거나 내 수령 기록이 COMPLETED일 때, QR은 만료 전 ISSUED만 센다.
 */
async function pickupStates(
  userId: string,
  reports: { id: string; status: string }[],
): Promise<Map<string, NonNullable<PickupState>>> {
  const out = new Map<string, NonNullable<PickupState>>();
  if (reports.length === 0) return out;
  const passed = await prisma.matchAttempt.findMany({
    where: {
      userId,
      lostReportId: { in: reports.map((r) => r.id) },
      OR: [{ result: "PASS" }, { answerCorrect: true }],
    },
    orderBy: { createdAt: "desc" },
    select: { lostReportId: true, foundItemId: true, foundItem: { select: { storageType: true } } },
  });
  const latest = new Map<string, (typeof passed)[number]>();
  for (const a of passed) if (!latest.has(a.lostReportId)) latest.set(a.lostReportId, a);
  if (latest.size === 0) return out;
  const itemIds = [...new Set([...latest.values()].map((a) => a.foundItemId))];
  const now = new Date();
  const mine = await prisma.pickup.findMany({
    where: { userId, foundItemId: { in: itemIds }, status: { in: ["ISSUED", "COMPLETED"] } },
    select: { foundItemId: true, status: true, qrExpiresAt: true },
  });
  const resolvedIds = new Set(reports.filter((r) => r.status === "RESOLVED").map((r) => r.id));
  for (const [reportId, a] of latest) {
    const own = mine.filter((p) => p.foundItemId === a.foundItemId);
    const status =
      resolvedIds.has(reportId) || own.some((p) => p.status === "COMPLETED")
        ? "COMPLETED"
        : own.some((p) => p.status === "ISSUED" && p.qrExpiresAt && p.qrExpiresAt > now)
          ? "QR_ISSUED"
          : "PASSED";
    out.set(reportId, { foundItemId: a.foundItemId, storageType: a.foundItem.storageType, status });
  }
  return out;
}

/** GET /lost-reports/:id/candidates */
export async function getCandidates(viewer: Viewer, reportId: string) {
  const report = await getOwnReport(reportId, viewer.userId);
  const { candidates, aiRead } = await withCandidates(report, viewer.role);
  return { candidates, aiRead };
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

/**
 * DELETE /lost-reports/:id: 신고자가 신고를 지운다.
 * 확인 시도 기록은 계정·물건별 실패 횟수(3회·10회 잠금)에 쓰이므로 남긴다. 지우고 다시 신고해 횟수를 되돌리지 못하게.
 * 대신 설명·분석 결과·임베딩을 비우고, 목록·후보·알림에서 빼고, 새 후보 알림도 받지 않게 닫는다.
 */
export async function deleteLostReport(viewer: Viewer, reportId: string): Promise<void> {
  const report = await getOwnReport(reportId, viewer.userId);
  await prisma.$transaction(async (tx) => {
    await tx.lostReport.update({
      where: { id: report.id },
      data: {
        deletedAt: new Date(),
        status: report.status === "OPEN" ? "CLOSED" : report.status,
        description: "",
        extractedAttributes: Prisma.DbNull,
      },
    });
    await clearLostReportEmbedding(report.id, tx);
    await tx.notification.deleteMany({ where: { lostReportId: report.id } });
    await tx.candidateExposure.deleteMany({ where: { lostReportId: report.id } });
  });
}
