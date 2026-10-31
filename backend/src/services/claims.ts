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
import { withTimeout } from "../lib/async";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { judgeAnswer } from "../matching/answer";
import { FAILED_ATTEMPT, failedAttemptCounts, findClaimableCandidate } from "../matching/candidates";
import { DESCRIPTION_KEY } from "../matching/compare";
import { judge } from "../matching/judge";
import { MAX_FAILED_ATTEMPTS, MAX_ITEM_FAILED_ATTEMPTS, NEED_MORE_LIMIT } from "../matching/policy";
import {
  brandQuestionFor,
  colorQuestionFor,
  isGenericFeature,
  isMemorable,
  isObviousForCategory,
  isPositionOnly,
  isQuizable,
  isThumbnailVisible,
  isUntrustedFragment,
  PRESET_DISTRACTORS,
  questionFor,
} from "../matching/questions";
import {
  colorDistractors,
  MIN_GUESS_QUESTIONS,
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

/**
 * 습득자 설명에서 나온 특징 중 객관식 질문으로 내도 되는 종류. 색·모양처럼 이름이 들어가기 어려운 것만 (10/31 QA).
 * 글자·각인(text), 안에 든 것(contents), 기타(other)는 이름·학번이 섞일 수 있어 계속 대조에만 쓴다.
 */
const QUIZ_SAFE_FINDER_KEYS = new Set(["sticker", "scratch", "case", "keyring", "pattern"]);

/** 영문·숫자가 섞인 값(이니셜 "J.H", 학번 등)은 안전한 종류라도 보기로 내지 않는다 */
function quizSafeFinderValue(value: string): boolean {
  return !/[A-Za-z0-9]/.test(value);
}

/**
 * 습득자 설명에서 나온 특징(source: "finder") 중 객관식으로 내면 안 되는 것의 "종류|값". 이 특징은 대조에만 쓴다.
 * 습득자가 쓴 이름·이니셜이 보기에 그대로 나가 남에게 보이지 않게 (10/30 코드 평가). 안전한 종류는 질문에 쓴다 (10/31 QA).
 */
export function finderFeatureIds(raw: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(raw)) return ids;
  for (const f of raw) {
    if (f && typeof f === "object" && (f as { source?: unknown }).source === "finder") {
      const { key, value } = f as { key?: unknown; value?: unknown };
      if (typeof key !== "string" || typeof value !== "string") continue;
      if (QUIZ_SAFE_FINDER_KEYS.has(key) && quizSafeFinderValue(value)) continue;
      ids.add(`${key}|${value.trim()}`);
    }
  }
  return ids;
}

/** 습득자 설명에서 나온 특징 전부의 "종류|값". 바로 통과 비율(75%)의 분모에서 뺀다 (10/31 QA) */
function allFinderFeatureIds(raw: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(raw)) return ids;
  for (const f of raw) {
    if (f && typeof f === "object" && (f as { source?: unknown }).source === "finder") {
      const { key, value } = f as { key?: unknown; value?: unknown };
      if (typeof key === "string" && typeof value === "string") ids.add(`${key}|${value.trim()}`);
    }
  }
  return ids;
}

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

const NEED_MORE_MESSAGE = "아직 근거가 부족해요. 주인만 알 만한 특징을 더 적어 주세요.";
const NO_FEATURE_IN_PERSON_MESSAGE =
  "이 물건은 사진에서 확인할 특징이 없어 온라인으로 확인하기 어려워요. 보관처(교무처)에서 직접 본인 확인을 받아 주세요.";

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
  if (a.result === "NEED_MORE")
    return {
      attemptId: a.id,
      reused,
      result: "NEED_MORE",
      message: NEED_MORE_MESSAGE,
      ...(await failFields(a.userId, a.foundItemId, db)),
    };
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
async function featureQuestion(
  feature: QuizSource,
  itemName: string | null,
  context: string | null = null,
  text: string = questionFor(feature as AiFeature, itemName),
): Promise<QuizQuestion | null> {
  // AI 오답이 같은 형식으로 3개 안 모이면 한 번 더 만든다 (온도가 있어 매번 다르게 나온다)
  return (await featureQuestionOnce(feature, context, text)) ?? featureQuestionOnce(feature, context, text);
}

/** 보기를 만들 대상: 습득물 특징, 또는 특징이 적은 물건에서 대신 묻는 브랜드(key "brand") */
type QuizSource = { key: string; value: string };

/**
 * 글자·각인 질문은 주인이 아는 이름으로 보기를 쓴다: 제조사와 한글 읽기를 함께 (10/31 실사용 영상: 정답 "Heroine Make"를
 * "키스미"로 아는 주인이 영문 보기 넷 중에서 고르지 못했다). 그래서 이 종류만 습득물 브랜드·설명을 AI에 함께 준다.
 */
const NAME_KEYS = new Set(["text", "engraving", "brand"]);

async function featureQuestionOnce(
  feature: QuizSource,
  context: string | null,
  text: string,
): Promise<QuizQuestion | null> {
  const named = NAME_KEYS.has(feature.key);
  let correct = feature.value;
  let fromAi: string[] = [];
  try {
    const out = await withTimeout(
      ai.quizOptions({ question: text, stored: feature.value, context: named ? context : null }),
      env.AI_TIMEOUT_MS,
      "보기 만들기",
    );
    const shared = words(out.correct).some((w) => w.length >= 2 && looselyContains(feature.value, w));
    if (shared && out.correct.trim().length <= (named ? 40 : 30)) correct = out.correct.trim();
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
 * 신고에 적지 않은 숨은 특징부터 묻고, 하나뿐이면 신고에 색을 적지 않았을 때 색을 함께 묻고, 그래도 모자라면 적었던 특징을 묻는다. 모두 맞혀야 통과.
 * 흠집·무늬는 이 모두를 쓴 뒤에만, 한 번에 하나까지만 묻는다(주인도 잘 모른다, 10/31 기획 피드백·실사용 영상).
 * 색은 신고에 안 적었거나 적은 색이 저장 색과 다를 때 묻는다: 연보라를 "분홍"이라 적은 주인도 보기에서 고를 수 있게.
 * 브랜드는 신고에 맞게 적지 않았을 때, 잘 아는 특징·색 다음, 흠집·무늬 앞에 묻는다. 특징이 흠집 하나뿐인 물건(흰색 에어팟)도
 * 흠집 위치 대신 주인이 아는 것을 먼저 묻게 (10/31 사칭 평가). first가 null이면(바로 통과를 막았는데 잘 아는 특징이 없음) 색·브랜드부터.
 */
async function buildQuiz(
  foundItemId: string,
  first: AiFeature | null,
  stored: AiFeature[],
  reportedKeys: string[],
  color: { stored: string | null; reported: string | null; matched: boolean },
  itemName: string | null,
  maxQuestions = QUIZ_QUESTIONS,
  context: string | null = null,
  brand: { stored: string | null; matched: boolean } = { stored: null, matched: false },
  guess = false,
  /** 바로 통과를 막은 시도: 판정이 고른 흠집·무늬보다 주인이 아는 특징·색·브랜드를 먼저 묻는다 */
  passBlocked = false,
  /** 신고 설명이 이미 맞힌 저장 특징 종류. 다시 묻지 않는다 (10/31 검증 1: 텀블러 "베이지색 뚜껑"을 적자마자 또 물었다) */
  matched: ReadonlySet<string> = new Set(),
  /** 습득물 종류. 종류만 알아도 맞히는 제품 이름·브랜드("아이패드", "Apple")는 묻지 않는다 (11/1 사칭 평가) */
  category: string | null = null,
): Promise<QuizQuestion[]> {
  const mentioned = new Set(reportedKeys);
  // 안쪽 작은 글자·재질·구조처럼 묻기 어렵거나 종류만으로 아는 특징도 묻지 않는다 (10/31 검증 2)
  // 맞힌 특징은 다시 묻지 않는다. 흠집처럼 누구나 말할 수 있는 특징은 맞혀도 아는 증거가 아니라서 위치를 물을 수 있게 남긴다
  // 정답이 그 종류의 대표 제품 이름인 글자 질문("아이패드 (iPad)")도 묻지 않는다 (11/1 사칭 평가)
  const allowed = (f: AiFeature) =>
    isQuizable(f) &&
    !(matched.has(f.key) && !isGenericFeature(f)) &&
    !(f.key === "text" && isObviousForCategory(f.value, category));
  const head = first && allowed(first) ? first : null;
  const rest = stored.filter((f) => f !== first && allowed(f));
  const unmentioned = rest.filter((f) => !mentioned.has(f.key));
  // 그래도 모자라면 신고에 적었던 특징도 묻는다. 모순·부정으로 적은 특징을 보기에서 다시 고르게 (10/30: 모순이면 바로 실패 대신 객관식)
  const again = rest.filter((f) => mentioned.has(f.key));
  // 흠집·무늬는 주인도 잘 몰라서 같은 묶음 안에서 잘 아는 특징을 먼저 묻는다 (10/31 기획 피드백).
  // 색은 흐린 사진에도 보여 맞히기 쉬우므로 예전처럼 적지 않은 특징 뒤에 둔다
  // 첫 질문은 판정이 고른 특징(잘 아는 특징이 먼저, 모순된 특징을 다시 묻는 경우 포함).
  // 찍기나 바로 통과를 막은 시도에서 그것이 흠집·무늬면 잘 아는 특징·색·브랜드 뒤로 보낸다
  const demote = (guess || passBlocked) && head !== null && !isMemorable(head);
  const firstEasy = head && !demote ? [head] : [];
  const firstHard = head && demote ? [head] : [];
  const base: (AiFeature | "color" | "brand")[] = [
    ...firstEasy,
    ...unmentioned.filter(isMemorable),
    "color",
    ...again.filter(isMemorable),
    "brand",
    ...firstHard,
    ...unmentioned.filter((f) => !isMemorable(f)),
    ...again.filter((f) => !isMemorable(f)),
  ];
  // 찍기(맞힌 특징 0)에서는 흐린 썸네일로 짐작할 수 있는 것(본체 색, 모양, 큰 부분 색, 무늬)을 맨 뒤로 미룬다 (10/31 사칭 평가:
  // 썸네일을 본 사칭이 핸드크림 뚜껑 색·키링 "강아지 모양"으로 통과). 빼지는 않는다: 질문이 모자라면 쓴다 (11/1 주인 평가)
  const visible = (f: AiFeature | "color" | "brand") => f === "color" || (f !== "brand" && isThumbnailVisible(f));
  const order = guess ? [...base.filter((f) => !visible(f)), ...base.filter(visible)] : base;
  const before = await previousQuestions(foundItemId);
  const reuse = (key: string, text: string) => {
    const q = before.get(key);
    return q && q.text === text && q.options.length === QUIZ_OPTIONS ? reshuffle(q) : null;
  };
  const storedColor = Color.safeParse(color.stored);
  const quiz: QuizQuestion[] = [];
  // 같은 질문을 두 번 내지 않는다 (10/31 사칭 평가: 슈나우저 키링에 "눈에 띄는 다른 특징은?"이 같은 보기로 세 번 나왔다).
  // 질문 문구는 특징 종류로 정해지므로 종류마다 하나, 같은 보기 묶음도 하나. 모자라면 반복하지 않고 적게 낸다
  const seen = new Set<string>();
  // 정답이 같은 질문도 하나로 본다: 글자 질문과 브랜드 질문의 정답이 둘 다 "아트릭스 (atrix)"면 사실상 한 문제다 (10/31 사칭 평가)
  const answers: string[] = [];
  const latinWords = (t: string) => (t.toLowerCase().match(/[a-z0-9&]{3,}/g) ?? []).filter((w) => !/^\d+$/.test(w));
  const sameAnswer = (a: string, b: string) =>
    a.trim() === b.trim() || latinWords(a).some((w) => latinWords(b).includes(w));
  const push = (q: QuizQuestion) => {
    const options = [...q.options].sort().join("|");
    const correct = q.options[q.answer] ?? "";
    if (seen.has(q.text) || seen.has(options) || answers.some((a) => sameAnswer(a, correct))) return;
    seen.add(q.text);
    seen.add(options);
    answers.push(correct);
    quiz.push(q);
  };
  // 위치만 다른 보기(상단/하단/측면)는 주인도 헷갈려 뒤로 미루고, 질문이 모자랄 때만 쓴다 (10/31 검증 2)
  const deferred: QuizQuestion[] = [];
  const offer = (q: QuizQuestion) => {
    if (isPositionOnly(q.options)) deferred.push(q);
    else push(q);
  };
  let hard = 0;
  for (const f of order) {
    if (quiz.length >= maxQuestions) break;
    if (f === "color") {
      if (color.matched || !storedColor.success || storedColor.data === "OTHER") continue;
      const text = colorQuestionFor(itemName);
      const label = COLOR_LABELS[storedColor.data];
      push(reuse("color", text) ?? makeQuestion(text, "color", label, colorDistractors(storedColor.data)));
      continue;
    }
    if (f === "brand") {
      if (brand.matched || !knownBrand(brand.stored) || isObviousForCategory(brand.stored, category)) continue;
      const text = brandQuestionFor(itemName);
      const q =
        reuse("brand", text) ?? (await featureQuestion({ key: "brand", value: brand.stored }, itemName, context, text));
      if (q) offer(q);
      continue;
    }
    // 흠집·무늬는 한 번에 하나까지만
    if (!isMemorable(f) && hard >= 1) continue;
    const text = questionFor(f, itemName);
    if (seen.has(text)) continue;
    const q = reuse(f.key, text) ?? (await featureQuestion(f, itemName, context));
    if (q) {
      const n = quiz.length;
      offer(q);
      if (quiz.length > n && !isMemorable(f)) hard++;
    }
  }
  const needed = guess ? MIN_GUESS_QUESTIONS : 1;
  for (const q of deferred) if (quiz.length < Math.min(needed, maxQuestions)) push(q);
  return quiz;
}

/** 사진에서 제대로 읽은 브랜드인지: 세 글자 이상이고 습득물 설명에도 적혀 있다 (글자 조각 "is" 같은 것은 아니다) */
function trustedBrandRead(brand: string | null, description: string | null): boolean {
  if (!knownBrand(brand)) return false;
  const compactText = (t: string) => t.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const b = compactText(brand);
  return b.length >= 3 && !!description && compactText(description).includes(b);
}

/** 신고에 브랜드 이름을 실제로 적었는지 */
function namedBrand(brand: string | null): boolean {
  return !!brand && brand.trim().length >= 2 && !/^(없음|모름|브랜드|상표|로고|모르겠)/.test(brand.trim());
}

/** AI가 브랜드를 못 읽었을 때 남기는 값은 질문하지 않는다 */
function knownBrand(brand: string | null): brand is string {
  return !!brand && !/^(없음|모름|알 수 없음|unknown|none|n\/a)$/i.test(brand.trim());
}

/** 보관이 끝난 물건(관리자 정리·기한 만료)·수령된 물건이면 그 오류. 아직 보관 중이면 null */
const ITEM_CLOSED_MESSAGE = "보관이 끝난 물건이에요. 교무처에 문의해 주세요.";
function closedItemError(item: { status: string; closedAt: Date | null; expiresAt: Date | null }): AppError | null {
  if (item.status === "CLAIMED") return new AppError("ALREADY_CLAIMED", "이미 주인이 찾아간 물건이에요.");
  const expired = item.expiresAt !== null && item.expiresAt <= new Date();
  if (item.closedAt || item.status === "EXPIRED" || expired) return new AppError("ITEM_CLOSED", ITEM_CLOSED_MESSAGE);
  return null;
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
  const report = await prisma.lostReport.findFirst({ where: { id: reportId, userId: viewer.userId, deletedAt: null } });
  if (!report) throw new AppError("NOT_FOUND", "신고를 찾을 수 없어요.");
  if (report.status !== "OPEN") throw new AppError("VALIDATION_ERROR", "닫힌 신고예요.");

  // 이 신고의 후보로 보이는(보여 준 적 있는) 물건에만 시도할 수 있다 (open-issues #20)
  const candidate = await findClaimableCandidate(report, viewer.role, foundItemId);
  if (!candidate) {
    // 보던 물건을 관리자가 정리했거나 기한이 지났으면 "볼 수 없어요" 대신 그렇다고 알린다 (10/31 검증). 보여 준 적 없는 물건은 그대로 403
    const seen = await prisma.candidateExposure.findUnique({
      where: { lostReportId_foundItemId: { lostReportId: report.id, foundItemId } },
      select: { foundItemId: true },
    });
    const closed = seen
      ? await prisma.foundItem.findUnique({
          where: { id: foundItemId },
          select: { status: true, closedAt: true, expiresAt: true },
        })
      : null;
    const err = closed && closedItemError(closed);
    if (err) throw err;
    throw new AppError("FORBIDDEN", "이 신고의 후보가 아닌 물건이에요.");
  }

  const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: foundItemId }, include: { detail: true } });
  // 예전에 저장된 가린 자리 특징도 빼고 견준다. 글자 인식 조각("is")은 믿을 수 없어 대조·질문 어디에도 쓰지 않는다 (10/31 검증 1)
  const storedFeatures = dropMaskTraces(Features.parse(item.detail?.features)).filter(
    (f) => !isUntrustedFragment(f, item.detail?.description),
  );
  const extracted = LostReportExtraction.partial().catch({}).parse(report.extractedAttributes);
  const reportedFeatures = extracted.features ?? [];

  // 1차 확인: 재사용·잠금이면 AI를 부르지 않는다
  const early = await reuseOrLock(prisma, viewer.userId, foundItemId, report);
  if (early) return early;

  // AI 대조는 오래 걸릴 수 있어 트랜잭션 밖에서 한다.
  // 안쪽 AI 호출은 함께 돌고 하나씩 제한 시간이 있어(넘으면 규칙 결과로 둔다) 다시 부르지 않는다. 다시 부르면 기다림이 두 배가 된다
  let comparison: Awaited<ReturnType<typeof ai.compareFeatures>>;
  try {
    comparison = await withTimeout(
      ai.compareFeatures(
        { color: extracted.color ?? null, brand: extracted.brand ?? null, features: reportedFeatures },
        {
          color: item.detail?.color ?? null,
          brand: item.detail?.brand ?? null,
          features: storedFeatures,
          description: item.detail?.description ?? null,
        },
        { callTimeoutMs: env.CLAIM_AI_CALL_TIMEOUT_MS },
      ),
      env.CLAIM_AI_TIMEOUT_MS,
      "특징 대조",
    );
  } catch (err) {
    logger.warn({ err }, "특징 대조 실패");
    throw new AppError("AI_UNAVAILABLE", "지금은 확인할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  // 같은 종류라도 다른 측면만 말했으면(저장 종류가 있는 모름) 그 종류는 아직 확인하지 않은 것으로 보고 물어볼 수 있게 둔다
  const mentionedKeys = comparison.features
    .filter((f) => !(f.verdict === "UNKNOWN" && f.storedKey))
    .map((f) => f.reportedKey);
  // 질문으로 낼 수 있는 특징: 습득자 설명에서 나온 것 중 이름이 섞일 수 있는 것은 뺀다
  const fromFinder = finderFeatureIds(item.detail?.features);
  // 안쪽 작은 글자("made in korea")·재질·구조("가죽 질감")는 질문으로 내지 않는다 (10/31 검증 2)
  const askableFeatures = storedFeatures.filter((f) => !fromFinder.has(`${f.key}|${f.value.trim()}`) && isQuizable(f));
  // 바로 통과 비율은 사진에서 나온 특징 기준으로 센다. 주인은 습득자가 덧붙인 설명을 알 수 없다 (10/31 QA).
  // 사진 특징이 하나도 없으면(사진 분석 실패 후 설명으로 등록) 설명 특징으로 센다
  const allFinder = allFinderFeatureIds(item.detail?.features);
  const photoFeatures = storedFeatures.filter((f) => !allFinder.has(`${f.key}|${f.value.trim()}`));
  // 바로 통과 비율도 물을 수 있는 특징으로 센다: 안쪽 작은 글자·재질처럼 주인이 적기 어려운 특징이 비율을 깎지 않게
  const ratioFeatures = (photoFeatures.length > 0 ? photoFeatures : storedFeatures).filter(isQuizable);
  // 브랜드가 확실히 다르면(믿을 만한 저장 브랜드 + 다른 브랜드 이름 + AI도 관계없다고 함) 틀린 특징으로 센다 (10/31 검증 1:
  // MK 지갑에 "나이키 로고"라고 적은 사칭이 객관식을 받았다). 주인 통과율을 재기 전까지 설정으로 끈다. 그 밖의 브랜드 차이는 통과만 막는다
  if (
    env.CLAIM_BRAND_HARD_CONTRADICTION &&
    comparison.brand === "CONTRADICT" &&
    comparison.brandCheck === "DIFFERENT" &&
    trustedBrandRead(item.detail?.brand ?? null, item.detail?.description ?? null) &&
    namedBrand(extracted.brand ?? null)
  )
    comparison = {
      ...comparison,
      features: [...comparison.features, { reportedKey: "brand", storedKey: "brand", verdict: "CONTRADICT" }],
    };
  let j = judge(comparison, askableFeatures, mentionedKeys, ratioFeatures);
  const matchedKeys = new Set(
    comparison.features
      .filter((f) => f.verdict === "MATCH" && f.storedKey && f.storedKey !== DESCRIPTION_KEY)
      .map((f) => f.storedKey as string),
  );
  const itemName = item.category ? itemLabel(item.category, subCategoryWithin(item.category, item.subCategory)) : null;
  // 찍기(질문 3개, 썸네일로 보이는 것은 뒤로)는 맞힌 특징이 하나도 없을 때만. 흠집처럼 흔한 특징만 맞혔으면 바로 통과는 막되
  // (judge passBlocked) 보통 객관식(2개)으로 본다. 흔한 특징만 맞힌 설명까지 찍기로 보내니 특징이 적은 물건의 주인이
  // 근거 부족에 갇혔다 (11/1 주인 평가 68→42/79)
  const guessMode = j.matches === 0;
  // 보기 만들기(AI)도 트랜잭션 밖에서 한다
  let quiz =
    j.result === "BORDERLINE"
      ? await buildQuiz(
          foundItemId,
          j.questionFeature,
          askableFeatures,
          mentionedKeys,
          {
            stored: item.detail?.color ?? null,
            reported: extracted.color ?? null,
            matched: comparison.color === "MATCH",
          },
          itemName,
          // 맞힌 특징이 없으면 찍기만으로 통과하기 어렵게 질문을 늘린다
          guessMode ? QUIZ_QUESTIONS_NO_EVIDENCE : QUIZ_QUESTIONS,
          [item.detail?.brand, item.detail?.description].filter(Boolean).join(" / ") || null,
          { stored: item.detail?.brand ?? null, matched: comparison.brand === "MATCH" },
          guessMode,
          j.passBlocked,
          matchedKeys,
          item.category,
        )
      : [];
  // 바로 통과를 막았는데 더 물을 것이 없고, 흔하지 않은 사진 특징을 맞혔으면 통과(주인이 특징을 이미 말했다). 흔한 특징뿐이면 아래에서 근거 부족
  if (
    j.result === "BORDERLINE" &&
    j.passBlocked &&
    quiz.length === 0 &&
    ratioFeatures.some((f) => matchedKeys.has(f.key) && !isGenericFeature(f))
  ) {
    j = { ...j, result: "PASS", questionFeature: null };
  }
  // 질문을 하나도 못 만들면 온라인으로는 확인할 수 없다. 찍기는 서로 다른 질문이 MIN_GUESS_QUESTIONS개 안 되면 내지 않는다
  // (같은 질문을 되풀이하지 않으니 질문 하나짜리 찍기는 1/4로 통과된다). 모순이 없으니 아래에서 근거 부족으로 바뀌어 기회를 쓰지 않는다
  if (j.result === "BORDERLINE" && (quiz.length === 0 || (guessMode && quiz.length < MIN_GUESS_QUESTIONS))) {
    j = { ...j, result: "FAIL", questionFeature: null };
  }
  const isGuess = j.result === "BORDERLINE" && j.matches === 0;
  const publicFields = [
    // 설명에서 맞힌 특징은 신고 쪽 종류로 보여 준다(화면은 신고 특징 값으로 이유를 쓴다)
    ...comparison.features
      .filter((f) => f.verdict === "MATCH")
      .map((f) => `feature:${f.storedKey === DESCRIPTION_KEY ? f.reportedKey : (f.storedKey ?? f.reportedKey)}`),
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

    // 맞힌 특징 없는 찍기는 계정·물건마다 한 번만 (10/30 코드 평가).
    // 설명만 바꿔 찍기 시도를 여러 개 열어 같은 보기를 하나씩 고르는 우회를 막는다:
    // 아직 안 답한 찍기 시도가 있으면 그것을 돌려주고, 이미 답했으면 특징을 더 적어야 다시 물어본다.
    if (isGuess) {
      const guesses = await tx.matchAttempt.findMany({
        where: {
          userId: viewer.userId,
          foundItemId,
          result: "BORDERLINE",
          matchedFields: { path: ["matches"], equals: 0 },
        },
        orderBy: { createdAt: "desc" },
      });
      const open = guesses.find((a) => a.answerCorrect === null);
      if (open) return toResponse(open, true, tx);
      if (guesses.length > 0) {
        j = { ...j, result: "FAIL", questionFeature: null };
        quiz = [];
      }
    }

    // 맞힌 것도 모순도 없는 실패는 실패로 세지 않고 특징을 더 적게 한다 (10/31 기획 피드백: 주인이 특징을 더 적을수록 횟수만 줄었다).
    // 틀린 특징(모순)이 있을 때만 기회를 쓴다. 아무 특징이나 넣어 보는 탐색은 계정·물건마다 시간당 횟수로 막는다.
    if (j.result === "FAIL" && j.contradictions === 0) {
      const since = new Date(Date.now() - NEED_MORE_LIMIT.windowMinutes * 60_000);
      const recent = await tx.matchAttempt.count({
        where: { userId: viewer.userId, foundItemId, result: "NEED_MORE", createdAt: { gte: since } },
      });
      // 물을 수 있는 특징이 하나도 없는 물건(특징 없음, 또는 재질·안쪽 글자뿐)은 더 적어도 온라인으로 확인하기 어려워
      // 대면 확인으로 안내한다 (open-issues #17, 10/31 검증 2: 가죽 질감·지퍼 포켓뿐인 카드지갑)
      if (recent >= NEED_MORE_LIMIT.count)
        throw new AppError(
          "RATE_LIMITED",
          askableFeatures.length === 0
            ? NO_FEATURE_IN_PERSON_MESSAGE
            : `특징이 부족한 확인은 ${NEED_MORE_LIMIT.windowMinutes / 60}시간에 ${NEED_MORE_LIMIT.count}번까지예요. 잠시 뒤 다시 시도해 주세요.`,
        );
      j = { ...j, result: "NEED_MORE", questionFeature: null };
      quiz = [];
    }

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
          softContradictions: j.softContradictions,
          public: [...new Set(publicFields)],
          quiz,
        },
        result: j.result,
        // 바로 통과를 막고 색·브랜드만 묻는 시도는 첫 객관식 질문을 대표 질문으로 남긴다
        question: quiz[0]?.text ?? (j.questionFeature ? questionFor(j.questionFeature, itemName) : null),
        questionFeatureKey: quiz[0]?.featureKey ?? j.questionFeature?.key ?? null,
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
  // 질문을 받은 뒤 물건이 정리·수령됐으면 답을 받지 않는다: 틀린 답이 끝난 물건에 실패로 쌓이거나, 사진을 지운 물건이 통과되지 않게 (10/31 검증)
  const closedBefore = closedItemError(attempt.foundItem);
  if (closedBefore) throw closedBefore;

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
    // 기다리는 사이 관리자가 정리했거나 수령됐을 수 있어 잠근 뒤 다시 본다
    const now = await tx.foundItem.findUniqueOrThrow({
      where: { id: attempt.foundItemId },
      select: { status: true, closedAt: true, expiresAt: true },
    });
    const closedNow = closedItemError(now);
    if (closedNow) throw closedNow;
    // 이 계정의 실패가 이미 한도면 남아 있던 시도로도 답할 수 없다
    const failures =
      (await failedAttemptCounts(viewer.userId, [attempt.foundItemId], tx)).get(attempt.foundItemId) ?? 0;
    if (failures >= MAX_FAILED_ATTEMPTS)
      throw new AppError("MATCH_LOCKED", "이 물건은 확인 시도 횟수를 모두 사용했어요.");
    // 같은 물건에 더 새 시도가 있으면 이 질문은 닫힌 것이다. 옛 시도를 모아 두고 하나씩 답하는 우회를 막는다
    const newer = await tx.matchAttempt.count({
      where: { userId: viewer.userId, foundItemId: attempt.foundItemId, createdAt: { gt: attempt.createdAt } },
    });
    if (newer > 0) throw new AppError("VALIDATION_ERROR", "이전 확인 질문은 닫혔어요. 가장 최근 질문에 답해 주세요.");

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
