// 주인 확인(F-07~F-09) 평가: 진짜 주인 설명과 사칭 설명으로 후보 노출·판정 결과를 잰다.
// 실행 (평가용 DB에서만. 운영 DB에서 돌리지 않는다):
//   npm run db:deploy -w backend && npm run db:seed -w backend
//   AI_MODE=gemini npm run eval:claims -w backend > 결과.md
// 체험용 시드 14개를 넣고, 물건마다 4가지 설명(특징 그대로 / 바꿔 말함 / 특징 없음 / 사칭)으로 체험 계정 신고를 만든다.
// 객관식 확인 질문이 나오면 주인 쪽은 정답을, 사칭 쪽은 늘 첫 보기를 고른다(찍기). 결과를 표로 찍는다.
// "찍기 사칭"(10/30 코드 평가): 특징 없이 일반 설명만 적고(= 특징 없음 설명) 질문은 무작위로 고르는 사람.
//   통과 확률은 보기 수로 정확히 계산된다(질문마다 1/보기 수). 실제로도 무작위로 골라 한 번 답해 본다.
import type { Category } from "@chajeumpyo/shared";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { guessProbability, quizOf } from "../src/matching/quiz";
import { answer, claim } from "../src/services/claims";
import { DEMO_SEED_ITEMS, seedDemoItems } from "../src/services/demo-seed";
import { createLostReport } from "../src/services/lost-reports";
import { CASES, KINDS, type Kind } from "./eval-cases";

if (env.NODE_ENV === "production") {
  console.error("운영 환경에서는 돌리지 않아요.");
  process.exit(1);
}

type Row = { seed: string; kind: Kind | "찍기 사칭"; inTop3: boolean; first: string; final: string; guess?: number };

const now = new Date();
await seedDemoItems(now);
const rows: Row[] = [];
let n = 0;
for (const item of DEMO_SEED_ITEMS) {
  const seed = item.id.slice(-3);
  const building = await prisma.building.findUniqueOrThrow({ where: { name: item.building } });
  for (const kind of [...KINDS, "찍기 사칭" as const]) {
    n++;
    // 판정 횟수가 섞이지 않게 설명마다 새 체험 계정
    const user = await prisma.user.create({
      data: { email: `eval-${Date.now()}-${n}@skuniv.ac.kr`, passwordHash: "x", role: "DEMO" },
    });
    const viewer = { userId: user.id, role: "DEMO" as const };
    const created = await createLostReport(viewer, {
      category: (item as unknown as { category: Category }).category,
      lostFrom: new Date(now.getTime() - 10 * 3600_000).toISOString(),
      lostTo: now.toISOString(),
      buildingId: building.id,
      description: CASES[seed]?.[kind === "찍기 사칭" ? "특징 없음" : kind] ?? "",
    });
    const inTop3 = created.candidates.some((c) => c.foundItemId === item.id);
    if (!inTop3) {
      rows.push({ seed, kind, inTop3, first: "후보 아님", final: "후보 아님" });
      continue;
    }
    const r = await claim(viewer, created.id, item.id);
    let final: string = r.result;
    let guess: number | undefined;
    if (r.result === "BORDERLINE") {
      const attempt = await prisma.matchAttempt.findUniqueOrThrow({ where: { id: r.attemptId } });
      const quiz = quizOf(attempt.matchedFields);
      const choices =
        kind === "사칭"
          ? quiz.map(() => 0)
          : kind === "찍기 사칭"
            ? quiz.map((q) => Math.floor(Math.random() * q.options.length))
            : quiz.map((q) => q.answer);
      final = quiz.length
        ? `질문 ${quiz.length}개 → ${(await answer(viewer, r.attemptId, { choices })).result}`
        : "질문(서술형)";
      if (kind === "찍기 사칭") guess = quiz.length ? guessProbability(quiz) : 0;
    } else if (kind === "찍기 사칭") guess = r.result === "PASS" ? 1 : 0;
    rows.push({ seed, kind, inTop3, first: r.result, final, guess });
    console.error(`${seed} ${kind}: ${inTop3 ? "후보" : "-"} ${r.result} → ${final}`);
  }
}

console.log("| 시드 | 설명 | 후보 3개 안 | 1단계 판정 | 최종 |");
console.log("| --- | --- | --- | --- | --- |");
for (const r of rows)
  console.log(`| ${r.seed} | ${r.kind} | ${r.inTop3 ? "예" : "아니오"} | ${r.first} | ${r.final} |`);
console.log("");
for (const kind of [...KINDS, "찍기 사칭" as const]) {
  const k = rows.filter((r) => r.kind === kind);
  const top3 = k.filter((r) => r.inTop3).length;
  const passFirst = k.filter((r) => r.first === "PASS").length;
  const passFinal = k.filter((r) => r.final === "PASS" || r.final.endsWith("PASS")).length;
  const border = k.filter((r) => r.first === "BORDERLINE").length;
  const fail = k.filter((r) => r.first === "FAIL").length;
  console.log(
    `- ${kind} (${k.length}건): 후보 3개 안 ${top3}, 1단계 통과 ${passFirst}, 확인 질문 ${border}, 1단계 실패 ${fail}, 최종 통과 ${passFinal}`,
  );
}
// 찍기 사칭: 한 번 시도의 평균 통과 확률(정확 계산). 맞힌 특징 없는 찍기는 계정·물건마다 한 번뿐이고,
// 물건마다 모든 계정의 실패가 10번 쌓이면 온라인 확인이 잠긴다(계정을 10개 만든 경우의 최댓값).
const guessRows = rows.filter((r) => r.kind === "찍기 사칭");
const avg = (f: (p: number) => number) =>
  guessRows.reduce((a, r) => a + f(r.guess ?? 0), 0) / Math.max(1, guessRows.length);
const p1 = avg((p) => p);
const p10 = avg((p) => 1 - (1 - p) ** 10);
console.log(
  `- 찍기 사칭 통과 확률(보기 수로 계산, 시드 평균): 계정 하나 ${(p1 * 100).toFixed(1)}%, 학교 계정 10개로 물건 잠길 때까지 ${(p10 * 100).toFixed(1)}%`,
);
await prisma.$disconnect();
