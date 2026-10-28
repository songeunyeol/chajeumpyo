import {
  AiFeature,
  type AnswerResponse,
  CATEGORY_LABELS,
  type ClaimResponse,
  LostReportExtraction,
  type Role,
} from "@chajeumpyo/shared";
import { z } from "zod";
import { ai } from "../ai";
import { env } from "../config/env";
import type { Prisma } from "../generated/prisma/client";
import { retryOnce, withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { judgeAnswer } from "../matching/answer";
import { FAILED_ATTEMPT, failedAttemptCounts, findCandidates } from "../matching/candidates";
import { judge } from "../matching/judge";
import { MAX_FAILED_ATTEMPTS, MAX_ITEM_FAILED_ATTEMPTS } from "../matching/policy";
import { questionFor } from "../matching/questions";
import { adminsInChargeOf, notifyUsers } from "./notifications";

type Viewer = { userId: string; role: Role };
type Attempt = Prisma.MatchAttemptGetPayload<object>;

const Features = z.array(AiFeature).catch([]);

/** 실패 응답에 넣을 값. 트랜잭션 안에서 부르면 방금 만든 시도와 방금 건 잠금까지 반영한다. */
async function failFields(userId: string, foundItemId: string, db: Prisma.TransactionClient = prisma) {
  if (await isInPersonOnly(foundItemId, db)) return { attemptsLeft: 0, inPersonOnly: true };
  const failures = (await failedAttemptCounts(userId, [foundItemId], db)).get(foundItemId) ?? 0;
  return { attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - failures), inPersonOnly: false };
}

/** 모든 계정의 실패가 쌓여 대면 확인만 되는 물건인지 (#29) */
async function isInPersonOnly(foundItemId: string, db: Prisma.TransactionClient = prisma) {
  const item = await db.foundItem.findUnique({ where: { id: foundItemId }, select: { claimLockedAt: true } });
  return item?.claimLockedAt != null;
}

const IN_PERSON_MESSAGE =
  "확인 실패가 많아 이 물건은 온라인으로 확인할 수 없어요. 보관처에서 직접 본인 확인을 받아 주세요.";

/**
 * 실패를 남긴 뒤 같은 트랜잭션에서 부른다. 모든 계정의 실패 합계가 한도에 닿으면
 * 온라인 확인을 막고 맡은 관리자에게 한 번 알린다 (#29). 체험용 시드는 막지 않는다.
 */
async function lockItemIfExhausted(tx: Prisma.TransactionClient, foundItemId: string) {
  const item = await tx.foundItem.findUniqueOrThrow({
    where: { id: foundItemId },
    select: {
      isSeed: true,
      claimLockedAt: true,
      storagePlaceId: true,
      category: true,
      building: { select: { name: true } },
    },
  });
  if (item.isSeed || item.claimLockedAt) return;
  const total = await tx.matchAttempt.count({ where: { foundItemId, ...FAILED_ATTEMPT } });
  if (total < MAX_ITEM_FAILED_ATTEMPTS) return;
  const { count } = await tx.foundItem.updateMany({
    where: { id: foundItemId, claimLockedAt: null },
    data: { claimLockedAt: new Date() },
  });
  if (count !== 1) return;
  const label = item.category ? CATEGORY_LABELS[item.category] : "물건";
  await notifyUsers(
    await adminsInChargeOf(item.storagePlaceId, tx),
    {
      type: "CLAIM_LOCKED",
      foundItemId,
      message: `${item.building.name}의 ${label} 확인에 ${total}번 실패해서 온라인 확인을 막았어요. 찾으러 오는 분은 직접 본인 확인을 해 주세요.`,
    },
    tx,
  );
}

/** 저장된 시도를 응답 형태로. 답한 경계 시도는 답 결과로 돌려준다. */
async function toResponse(a: Attempt, reused: boolean, db: Prisma.TransactionClient = prisma): Promise<ClaimResponse> {
  const passed = a.result === "PASS" || (a.result === "BORDERLINE" && a.answerCorrect === true);
  if (passed) {
    const fields = (a.matchedFields as { public?: string[] }).public ?? [];
    return { attemptId: a.id, reused, result: "PASS", matchedFields: fields, foundItemId: a.foundItemId };
  }
  if (a.result === "BORDERLINE" && a.answerCorrect === null && a.question) {
    return { attemptId: a.id, reused, result: "BORDERLINE", question: a.question };
  }
  return { attemptId: a.id, reused, result: "FAIL", ...(await failFields(a.userId, a.foundItemId, db)) };
}

/**
 * 같은 습득물에 대한 판정·답을 한 번에 하나씩 처리한다.
 * 동시 요청으로 계정별 3회·물건별 10회 한도를 넘기지 못하게 (계정이 달라도 같은 물건이면 줄을 선다).
 */
async function lockItem(tx: Prisma.TransactionClient, foundItemId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`claim:${foundItemId}`}, 0))`;
}

/** POST /lost-reports/:id/claims (F-08) */
export async function claim(viewer: Viewer, reportId: string, foundItemId: string): Promise<ClaimResponse> {
  const report = await prisma.lostReport.findFirst({ where: { id: reportId, userId: viewer.userId } });
  if (!report) throw new AppError("NOT_FOUND", "신고를 찾을 수 없어요.");
  if (report.status !== "OPEN") throw new AppError("VALIDATION_ERROR", "닫힌 신고예요.");

  // 지금 이 신고의 후보로 보이는 물건에만 시도할 수 있다 (open-issues #20)
  const candidate = (await findCandidates(report, viewer.role)).find((c) => c.foundItemId === foundItemId);
  if (!candidate) throw new AppError("FORBIDDEN", "이 신고의 후보가 아닌 물건이에요.");

  const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: foundItemId }, include: { detail: true } });
  const storedFeatures = Features.parse(item.detail?.features);
  const extracted = LostReportExtraction.partial().catch({}).parse(report.extractedAttributes);
  const reportedFeatures = extracted.features ?? [];

  // 1차 확인: 재사용·잠금이면 AI를 부르지 않는다
  const early = await reuseOrLock(prisma, viewer.userId, foundItemId, report);
  if (early) return early;

  // AI 대조는 오래 걸릴 수 있어 트랜잭션 밖에서 한다
  let comparison: Awaited<ReturnType<typeof ai.compareFeatures>>;
  try {
    comparison = await retryOnce(() =>
      withTimeout(
        ai.compareFeatures(
          { color: extracted.color ?? null, brand: extracted.brand ?? null, features: reportedFeatures },
          { color: item.detail?.color ?? null, brand: item.detail?.brand ?? null, features: storedFeatures },
        ),
        env.AI_TIMEOUT_MS,
        "특징 대조",
      ),
    );
  } catch (err) {
    logger.warn({ err }, "특징 대조 실패");
    throw new AppError("AI_UNAVAILABLE", "지금은 확인할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  const j = judge(
    comparison,
    storedFeatures,
    reportedFeatures.map((f) => f.key),
  );
  const publicFields = [
    ...comparison.features.filter((f) => f.verdict === "MATCH").map((f) => `feature:${f.storedKey ?? f.reportedKey}`),
    ...(comparison.color === "MATCH" ? ["color"] : []),
    ...(comparison.brand === "MATCH" ? ["brand"] : []),
    ...(candidate.score.place === 1 ? ["place"] : []),
    ...(candidate.score.time >= 0.6 ? ["time"] : []),
  ];

  return prisma.$transaction(async (tx) => {
    // 같은 물건의 동시 요청은 여기서 줄을 선다. 잠근 뒤 다시 확인한다.
    await lockItem(tx, foundItemId);
    const again = await reuseOrLock(tx, viewer.userId, foundItemId, report);
    if (again) return again;

    const attempt = await tx.matchAttempt.create({
      data: {
        userId: viewer.userId,
        lostReportId: report.id,
        foundItemId,
        descriptionHash: report.descriptionHash,
        score: candidate.score.total,
        scoreBreakdown: candidate.score,
        matchedFields: {
          comparison,
          matches: j.matches,
          contradictions: j.contradictions,
          public: [...new Set(publicFields)],
        },
        result: j.result,
        question: j.questionFeature ? questionFor(j.questionFeature) : null,
        questionFeatureKey: j.questionFeature?.key ?? null,
      },
    });
    if (j.result === "FAIL") await lockItemIfExhausted(tx, foundItemId);
    return toResponse(attempt, false, tx);
  });
}

/**
 * 새 시도를 만들지 않아도 되는 경우를 처리한다.
 * - 이미 통과한 물건: 그 결과
 * - 설명이 그대로인 이전 시도: 그 결과, 횟수 안 씀 (open-issues #8)
 * - 물건이 대면 확인으로 넘어감: 409 IN_PERSON_REQUIRED (#29)
 * - 이 계정의 실패 횟수 초과: 409 MATCH_LOCKED
 */
async function reuseOrLock(
  db: Prisma.TransactionClient,
  userId: string,
  foundItemId: string,
  report: { id: string; descriptionHash: string },
): Promise<ClaimResponse | null> {
  const previous = await db.matchAttempt.findMany({ where: { userId, foundItemId }, orderBy: { createdAt: "desc" } });
  const passed = previous.find((a) => a.result === "PASS" || a.answerCorrect === true);
  if (passed) return toResponse(passed, true, db);
  const same = previous.find((a) => a.lostReportId === report.id && a.descriptionHash === report.descriptionHash);
  if (same) return toResponse(same, true, db);
  if (await isInPersonOnly(foundItemId, db)) throw new AppError("IN_PERSON_REQUIRED", IN_PERSON_MESSAGE);
  const failures = previous.filter((a) => a.result === "FAIL" || a.answerCorrect === false).length;
  if (failures >= MAX_FAILED_ATTEMPTS)
    throw new AppError("MATCH_LOCKED", "이 물건은 확인 시도 횟수를 모두 사용했어요.");
  return null;
}

/** POST /claims/:attemptId/answer (F-09). 질문 하나당 한 번만 답할 수 있다. */
export async function answer(viewer: Viewer, attemptId: string, rawAnswer: string): Promise<AnswerResponse> {
  const attempt = await prisma.matchAttempt.findFirst({
    where: { id: attemptId, userId: viewer.userId },
    include: { foundItem: { include: { detail: true } } },
  });
  if (!attempt) throw new AppError("NOT_FOUND", "확인 질문을 찾을 수 없어요.");
  if (attempt.result !== "BORDERLINE" || !attempt.question || !attempt.questionFeatureKey) {
    throw new AppError("VALIDATION_ERROR", "답할 질문이 없는 시도예요.");
  }
  if (attempt.answerCorrect !== null) throw new AppError("ALREADY_ANSWERED", "이미 답한 질문이에요.");
  // 답 판정(AI)을 부르기 전에 막는다
  if (attempt.foundItem.claimLockedAt) throw new AppError("IN_PERSON_REQUIRED", IN_PERSON_MESSAGE);

  const stored = Features.parse(attempt.foundItem.detail?.features).find((f) => f.key === attempt.questionFeatureKey);
  let verdict: "MATCH" | "NO_MATCH" = "NO_MATCH";
  if (stored) {
    try {
      verdict = await judgeAnswer(attempt.question, stored.value, rawAnswer);
    } catch (err) {
      logger.warn({ err }, "답 판정 실패");
      throw new AppError("AI_UNAVAILABLE", "지금은 답을 확인할 수 없어요. 잠시 후 다시 답해 주세요.");
    }
  }

  return prisma.$transaction(async (tx) => {
    // 판정과 같은 줄에 선다. 기다리는 사이 다른 계정의 실패로 잠겼을 수 있어 다시 확인한다.
    await lockItem(tx, attempt.foundItemId);
    if (await isInPersonOnly(attempt.foundItemId, tx)) throw new AppError("IN_PERSON_REQUIRED", IN_PERSON_MESSAGE);

    // 동시에 두 번 답해도 한 번만 반영된다
    const { count } = await tx.matchAttempt.updateMany({
      where: { id: attempt.id, answerCorrect: null },
      data: { answerCorrect: verdict === "MATCH", answeredAt: new Date() },
    });
    if (count !== 1) throw new AppError("ALREADY_ANSWERED", "이미 답한 질문이에요.");

    if (verdict === "MATCH") return { result: "PASS", foundItemId: attempt.foundItemId };
    await lockItemIfExhausted(tx, attempt.foundItemId);
    return { result: "FAIL", ...(await failFields(viewer.userId, attempt.foundItemId, tx)) };
  });
}
