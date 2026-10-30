import {
  AiFeature,
  type AnswerRequest,
  type AnswerResponse,
  CATEGORY_LABELS,
  type ClaimResponse,
  COLOR_LABELS,
  Color,
  itemLabel,
  LostReportExtraction,
  type Role,
  subCategoryWithin,
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
import { FAILED_ATTEMPT, failedAttemptCounts, findClaimableCandidate } from "../matching/candidates";
import { judge } from "../matching/judge";
import { MAX_FAILED_ATTEMPTS, MAX_ITEM_FAILED_ATTEMPTS } from "../matching/policy";
import { colorQuestionFor, isAskable, PRESET_DISTRACTORS, questionFor } from "../matching/questions";
import {
  colorDistractors,
  makeQuestion,
  QUIZ_OPTIONS,
  QUIZ_QUESTIONS,
  QUIZ_QUESTIONS_NO_EVIDENCE,
  type QuizQuestion,
  quizOf,
  reshuffle,
  shuffle,
  uniformDistractors,
} from "../matching/quiz";
import { dropMaskTraces, looselyContains, words } from "../matching/text";
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
      message: `${item.building ? `${item.building.name}의 ` : ""}${label} 확인에 ${total}번 실패해서 온라인 확인을 막았어요. 찾으러 오는 분은 직접 본인 확인을 해 주세요.`,
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
    const questions = quizOf(a.matchedFields).map(({ text, options }) => ({ text, options }));
    return { attemptId: a.id, reused, result: "BORDERLINE", question: a.question, questions };
  }
  return { attemptId: a.id, reused, result: "FAIL", ...(await failFields(a.userId, a.foundItemId, db)) };
}

/**
 * 특징 질문 하나. AI가 다듬은 정답이 저장 값과 낱말이 하나도 안 겹치면 저장 값을 그대로 쓴다.
 * 오답은 정답과 같은 형식·구체성으로만 고르고(정답이 티 나지 않게), 못 채우면 null (이 질문은 내지 않는다).
 */
async function featureQuestion(feature: AiFeature, itemName: string | null): Promise<QuizQuestion | null> {
  // AI 오답이 같은 형식으로 3개 안 모이면 한 번 더 만든다 (온도가 있어 매번 다르게 나온다)
  return (await featureQuestionOnce(feature, itemName)) ?? featureQuestionOnce(feature, itemName);
}

async function featureQuestionOnce(feature: AiFeature, itemName: string | null): Promise<QuizQuestion | null> {
  const text = questionFor(feature, itemName);
  let correct = feature.value;
  let fromAi: string[] = [];
  try {
    const out = await withTimeout(
      ai.quizOptions({ question: text, stored: feature.value }),
      env.AI_TIMEOUT_MS,
      "보기 만들기",
    );
    const shared = words(out.correct).some((w) => w.length >= 2 && looselyContains(feature.value, w));
    if (shared && out.correct.trim().length <= 30) correct = out.correct.trim();
    fromAi = out.distractors;
  } catch (err) {
    logger.warn({ err }, "확인 질문 보기 만들기 실패 → 준비된 보기");
  }
  const distractors = uniformDistractors(correct, fromAi, shuffle(PRESET_DISTRACTORS[feature.key] ?? []), text).filter(
    (d) => !looselyContains(d, feature.value) && !looselyContains(feature.value, d),
  );
  if (distractors.length < QUIZ_OPTIONS - 1) return null;
  return makeQuestion(text, feature.key, correct, distractors);
}

/** 이 물건에 이미 낸 질문(계정 무관, 최근 것). 같은 질문이면 같은 보기 세트를 다시 쓴다 */
async function previousQuestions(foundItemId: string): Promise<Map<string, QuizQuestion>> {
  const attempts = await prisma.matchAttempt.findMany({
    where: { foundItemId, result: "BORDERLINE" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { matchedFields: true },
  });
  const byKey = new Map<string, QuizQuestion>();
  for (const a of attempts)
    for (const q of quizOf(a.matchedFields)) if (!byKey.has(q.featureKey)) byKey.set(q.featureKey, q);
  return byKey;
}

/**
 * 경계 판정의 객관식 질문 (F-09, 10/29 은열 의견: 서술형은 맞히기 어렵다).
 * 신고에 적지 않은 숨은 특징부터 묻고, 하나뿐이면 신고에 색을 적지 않았을 때 색을 함께 묻는다. 모두 맞혀야 통과.
 */
async function buildQuiz(
  foundItemId: string,
  first: AiFeature,
  stored: AiFeature[],
  reportedKeys: string[],
  color: { stored: string | null; reported: string | null },
  itemName: string | null,
  maxQuestions = QUIZ_QUESTIONS,
): Promise<QuizQuestion[]> {
  const mentioned = new Set(reportedKeys);
  const candidates = [first, ...stored.filter((f) => f !== first && isAskable(f) && !mentioned.has(f.key))];
  const before = await previousQuestions(foundItemId);
  const reuse = (key: string, text: string) => {
    const q = before.get(key);
    return q && q.text === text && q.options.length === QUIZ_OPTIONS ? reshuffle(q) : null;
  };
  const quiz: QuizQuestion[] = [];
  for (const f of candidates) {
    if (quiz.length >= maxQuestions) break;
    const q = reuse(f.key, questionFor(f, itemName)) ?? (await featureQuestion(f, itemName));
    if (q) quiz.push(q);
  }
  const storedColor = Color.safeParse(color.stored);
  if (quiz.length < maxQuestions && !color.reported && storedColor.success && storedColor.data !== "OTHER") {
    const label = COLOR_LABELS[storedColor.data];
    const text = colorQuestionFor(itemName);
    quiz.push(reuse("color", text) ?? makeQuestion(text, "color", label, colorDistractors(storedColor.data)));
  }
  return quiz;
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

  // 이 신고의 후보로 보이는(보여 준 적 있는) 물건에만 시도할 수 있다 (open-issues #20)
  const candidate = await findClaimableCandidate(report, viewer.role, foundItemId);
  if (!candidate) throw new AppError("FORBIDDEN", "이 신고의 후보가 아닌 물건이에요.");

  const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: foundItemId }, include: { detail: true } });
  // 예전에 저장된 가린 자리 특징도 빼고 견준다
  const storedFeatures = dropMaskTraces(Features.parse(item.detail?.features));
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
  // 같은 종류라도 다른 측면만 말했으면(저장 종류가 있는 모름) 그 종류는 아직 확인하지 않은 것으로 보고 물어볼 수 있게 둔다
  const mentionedKeys = comparison.features
    .filter((f) => !(f.verdict === "UNKNOWN" && f.storedKey))
    .map((f) => f.reportedKey);
  let j = judge(comparison, storedFeatures, mentionedKeys);
  const itemName = item.category ? itemLabel(item.category, subCategoryWithin(item.category, item.subCategory)) : null;
  // 보기 만들기(AI)도 트랜잭션 밖에서 한다
  let quiz = j.questionFeature
    ? await buildQuiz(
        foundItemId,
        j.questionFeature,
        storedFeatures,
        mentionedKeys,
        { stored: item.detail?.color ?? null, reported: extracted.color ?? null },
        itemName,
        // 맞힌 특징이 없으면 찍기만으로 통과하기 어렵게 질문을 늘린다
        j.matches === 0 ? QUIZ_QUESTIONS_NO_EVIDENCE : QUIZ_QUESTIONS,
      )
    : [];
  // 맞힌 특징 없는 찍기는 계정·물건마다 한 번만: 이미 틀렸으면 특징을 더 적어야 다시 물어본다 (10/30 코드 평가).
  // 질문을 하나도 못 만들면 온라인으로는 확인할 수 없다.
  if (j.result === "BORDERLINE" && j.matches === 0) {
    const guessedBefore = await prisma.matchAttempt.count({
      where: {
        userId: viewer.userId,
        foundItemId,
        answerCorrect: false,
        matchedFields: { path: ["matches"], equals: 0 },
      },
    });
    if (guessedBefore > 0 || quiz.length === 0) {
      j = { ...j, result: "FAIL", questionFeature: null };
      quiz = [];
    }
  }
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
          quiz,
        },
        result: j.result,
        question: j.questionFeature ? questionFor(j.questionFeature, itemName) : null,
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

/**
 * POST /claims/:attemptId/answer (F-09). 질문 하나당 한 번만 답할 수 있다.
 * choices: 객관식 보기 번호(질문 순서대로), 모두 맞아야 통과. answer: 자유 입력, 객관식이 없는 예전 시도에서만 첫 질문의 특징과 대조.
 */
export async function answer(viewer: Viewer, attemptId: string, body: AnswerRequest): Promise<AnswerResponse> {
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
  const quiz = quizOf(attempt.matchedFields);
  const { choices, answer: rawAnswer } = body;
  // 객관식이 나온 시도는 보기 번호로만 답한다. 자유 입력으로 보기를 그대로 적어 첫 질문만 맞히는 우회를 막는다 (10/30 코드 평가)
  if (quiz.length > 0 && !choices) throw new AppError("VALIDATION_ERROR", "보기 중에서 골라 주세요.");
  let verdict: "MATCH" | "NO_MATCH" = "NO_MATCH";
  if (choices) {
    if (choices.length !== quiz.length) throw new AppError("VALIDATION_ERROR", "모든 질문에 답을 골라 주세요.");
    verdict = quiz.every((q, i) => q.answer === choices[i]) ? "MATCH" : "NO_MATCH";
  } else if (stored && rawAnswer) {
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
