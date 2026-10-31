// 주인·사칭 판정 평가 (실제 Gemini, 로컬 임시 DB에서만. 운영에서는 멈춘다). 사용법은 docs/handoff-night-claims.md.
//   register <photos> <labels> <out>      : 사진을 한 번만 등록(분석 → 확정)하고 <out>/regs.json을 남긴다
//   owners   <photos> <labels> <out> <tag> : 주인 설명 3가지로 확인. 객관식은 원본 사진을 본 주인(AI)이 고른다
//   impostors <photos> <labels> <out> <tag>: 사칭 a~e. c는 흐린 썸네일을 본 AI가 보기를 고른다
// <photos>는 팀 사진 폴더(레포에 없음, 파일 이름 끝 세 자리 숫자가 labels의 photo), <labels>는 scripts/eval-night-claims.labels.json.
// owners·impostors는 시작할 때 이 DB의 신고·시도를 모두 지운다: 개발·운영 DB에 대고 돌리지 말 것.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type Category, COLOR_LABELS, CONSENT_VERSION, itemLabel } from "@chajeumpyo/shared";
import { GoogleGenAI } from "@google/genai";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { quizOf } from "../src/matching/quiz";
import { answer, claim } from "../src/services/claims";
import { analyzeFoundItem, confirmFoundItem } from "../src/services/found-items";
import { createLostReport, updateLostReport } from "../src/services/lost-reports";

if (env.NODE_ENV === "production") throw new Error("운영에서는 안 돌린다");
const [mode, dir, labelsPath, outDir, tag = "x"] = process.argv.slice(2);
if (!mode || !dir || !labelsPath || !outDir) throw new Error("usage: <mode> <photos> <labels> <out> [tag]");

type ItemLabel = {
  key: string;
  photo: string;
  building: string;
  category: Category;
  그대로: string;
  "바꿔 말함": string;
};
const labels = JSON.parse(await readFile(labelsPath, "utf8")) as { items: ItemLabel[] };
const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
const numOf = (f: string) => f.slice(0, -extname(f).length).match(/(\d{3})$/)?.[1] ?? "";
const fileOf = new Map(files.map((f) => [numOf(f), f]));
const gen = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
let aiCalls = 0;

let stop = false;
let aiDown = 0;
async function retry<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (err) {
    const m = (err as Error).message;
    if (/\b402\b|billing|prepay|credit/i.test(m)) {
      stop = true;
      throw err;
    }
    if (!/\b(429|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(m)) throw err;
    await sleep(15_000);
    return f();
  }
}
const code = (err: unknown) => (err as { code?: string }).code ?? (err as Error).message.slice(0, 80);

type Reg = {
  key: string;
  id: string;
  category: Category;
  sub: string | null;
  color: string | null;
  buildingId: number;
  label: ItemLabel;
  thumb: string | null;
};

if (mode === "register") {
  const place = await prisma.storagePlace.findFirstOrThrow({ where: { isActive: true } });
  const regs: Reg[] = [];
  for (const [i, item] of labels.items.entries()) {
    if (stop) break;
    const file = fileOf.get(item.photo);
    if (!file) continue;
    const building = await prisma.building.findUniqueOrThrow({ where: { name: item.building } });
    const image = await readFile(join(dir, file));
    try {
      const d = await retry(() =>
        analyzeFoundItem({
          image,
          fields: { consentVersion: CONSENT_VERSION, consentExternalAi: true, consentLocation: false } as never,
          fingerprint: `nc-${Date.now()}-${i}`,
        }),
      );
      await retry(() =>
        confirmFoundItem(d.id, {
          confirmToken: d.confirmToken,
          buildingId: building.id,
          storageType: "HANDED_OVER",
          storagePlaceId: place.id,
          ...(d.category !== item.category ? { category: item.category } : {}),
        } as never),
      );
      const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id }, include: { detail: true } });
      regs.push({
        key: item.key,
        id: d.id,
        category: row.category as Category,
        sub: row.subCategory,
        color: row.detail?.color ?? null,
        buildingId: building.id,
        label: item,
        thumb: row.detail?.imageThumbKey ?? null,
      });
      console.error(
        `등록 ${item.key}: ${row.category}/${row.subCategory ?? "-"} ${row.detail?.color} ${JSON.stringify(row.detail?.features)}`,
      );
    } catch (err) {
      console.error(`등록 실패 ${item.key}: ${code(err)}`);
    }
  }
  await writeFile(join(outDir, "regs.json"), JSON.stringify(regs, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

const regs = JSON.parse(await readFile(join(outDir, "regs.json"), "utf8")) as Reg[];
// 이 실행의 시도만 남도록 앞 실행의 신고·시도를 지운다(등록한 물건은 그대로)
await prisma.revealLog.deleteMany({});
await prisma.notification.deleteMany({});
await prisma.pickup.deleteMany({});
await prisma.matchAttempt.deleteMany({});
await prisma.candidateExposure.deleteMany({});
await prisma.lostReport.deleteMany({});
await prisma.foundItem.updateMany({
  where: { id: { in: regs.map((r) => r.id) } },
  data: { claimLockedAt: null, status: "REGISTERED" },
});

let userN = 0;
async function newViewer() {
  userN++;
  const u = await prisma.user.create({
    data: { email: `nc-${tag}-${Date.now()}-${userN}@skuniv.ac.kr`, passwordHash: "x", role: "USER" },
  });
  return { userId: u.id, role: "USER" as const };
}
const now = new Date();
const lostWindow = () => ({
  lostFrom: new Date(now.getTime() - 3 * 3600_000).toISOString(),
  lostTo: new Date().toISOString(),
});

/** 보기 고르기: image(주인은 원본, 사칭 c는 흐린 썸네일)와 역할을 주고 번호를 받는다 */
async function pick(role: string, image: Buffer | null, q: { text: string; options: string[] }): Promise<number> {
  aiCalls++;
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
  if (image) parts.push({ inlineData: { mimeType: "image/jpeg", data: image.toString("base64") } });
  parts.push({
    text: `${role}\n질문: ${q.text}\n${q.options.map((o, i) => `${i}. ${o}`).join("\n")}\n가장 맞다고 생각하는 보기 번호 하나만 숫자로 답하라.`,
  });
  const res = await retry(() =>
    gen.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: { temperature: 0, thinkingConfig: { thinkingLevel: "MINIMAL" as never } },
    }),
  );
  const n = Number.parseInt((res.text ?? "").match(/\d/)?.[0] ?? "", 10);
  return Number.isNaN(n) || n >= q.options.length ? Math.floor(Math.random() * q.options.length) : n;
}

type Step = {
  desc: string;
  result: string;
  quiz?: { text: string; options: string[]; answer: number; chose: number }[];
};
type Run = { item: string; kind: string; steps: Step[]; final: string; firstResult: string };
const runs: Run[] = [];

async function attempt(
  reg: Reg,
  kind: string,
  descs: string[],
  answerer: ((q: { text: string; options: string[] }) => Promise<number>) | null,
  opts: { followUpOnNeedMore?: string; simulateWait?: boolean } = {},
): Promise<Run> {
  const viewer = await newViewer();
  const run: Run = { item: reg.key, kind, steps: [], final: "-", firstResult: "-" };
  let reportId: string | null = null;
  const queue = [...descs];
  let followed = false;
  while (queue.length && !stop) {
    const desc = queue.shift() as string;
    try {
      if (!reportId) {
        const r = await retry(() =>
          createLostReport(viewer, {
            category: reg.category,
            buildingId: reg.buildingId,
            description: desc,
            ...lostWindow(),
          }),
        );
        reportId = r.id;
        if (!r.candidates.some((c) => c.foundItemId === reg.id)) {
          run.steps.push({ desc, result: "후보 아님" });
          run.final = run.firstResult = "후보 아님";
          return run;
        }
      } else await retry(() => updateLostReport(viewer, reportId as string, { description: desc }));
      let r: Awaited<ReturnType<typeof claim>>;
      try {
        r = await retry(() => claim(viewer, reportId as string, reg.id));
      } catch (err) {
        if (code(err) === "RATE_LIMITED" && opts.simulateWait) {
          await prisma.matchAttempt.updateMany({
            where: { userId: viewer.userId, foundItemId: reg.id, result: "NEED_MORE" },
            data: { createdAt: new Date(Date.now() - 2 * 3600_000) },
          });
          r = await retry(() => claim(viewer, reportId as string, reg.id));
        } else throw err;
      }
      if (run.firstResult === "-") run.firstResult = r.result;
      const step: Step = { desc, result: r.result };
      if (r.result === "BORDERLINE") {
        const a = await prisma.matchAttempt.findUniqueOrThrow({ where: { id: r.attemptId } });
        const quiz = quizOf(a.matchedFields);
        step.quiz = [];
        const choices: number[] = [];
        for (const q of quiz) {
          const chose = answerer ? await answerer(q) : Math.floor(Math.random() * q.options.length);
          choices.push(chose);
          step.quiz.push({ text: q.text, options: q.options, answer: q.answer, chose });
        }
        if (quiz.length) {
          const ans = await retry(() => answer(viewer, r.attemptId, { choices }));
          step.result = `BORDERLINE→${ans.result}`;
          if (ans.result === "PASS") {
            run.steps.push(step);
            run.final = "PASS";
            return run;
          }
        }
      }
      run.steps.push(step);
      if (r.result === "PASS") {
        run.final = "PASS";
        return run;
      }
      if (r.result === "NEED_MORE" && opts.followUpOnNeedMore && !followed) {
        followed = true;
        queue.unshift(`${desc} ${opts.followUpOnNeedMore}`);
      }
      run.final = step.result;
    } catch (err) {
      const c = code(err);
      // 크레딧 소진(402)은 claims가 AI_UNAVAILABLE로 감싸므로 연달아 나오면 멈춘다
      aiDown = c === "AI_UNAVAILABLE" ? aiDown + 1 : 0;
      if (aiDown >= 4) stop = true;
      run.steps.push({ desc, result: `ERR ${c}` });
      run.final = `ERR ${c}`;
      if (["MATCH_LOCKED", "IN_PERSON_REQUIRED", "FORBIDDEN", "RATE_LIMITED"].includes(c) || stop) return run;
    }
  }
  return run;
}

const flush = () => writeFile(join(outDir, `${mode}-${tag}.json`), JSON.stringify({ aiCalls, runs }, null, 2));
const OWNER =
  "너는 사진 속 물건의 진짜 주인이다. 오래 써서 겉모습은 잘 알지만 사진처럼 세세하게 외우지는 못한다. 확실하지 않으면 가장 그럴듯한 것을 고른다.";
const THUMB =
  "너는 이 물건의 주인이 아니다. 후보 화면의 흐린 사진만 보고, 보기 중 사진과 가장 어울리는 것을 골라 확인을 통과하려 한다.";
const firstSentence = (t: string) => `${t.split(/(?<=[.!?요])\s/)[0]?.trim() ?? t}`;

if (mode === "owners") {
  for (const reg of regs) {
    if (stop) break;
    const photo = await readFile(join(dir, fileOf.get(reg.label.photo) as string));
    const own = (q: { text: string; options: string[] }) => pick(OWNER, photo, q);
    const vague = firstSentence(reg.label.그대로);
    const set: [string, string][] = [
      ["그대로", reg.label.그대로],
      ["바꿔 말함", reg.label["바꿔 말함"]],
      ...(vague !== reg.label.그대로 ? ([["막연함", vague]] as [string, string][]) : []),
    ];
    for (const [kind, desc] of set) {
      const follow =
        kind === "막연함" ? reg.label["바꿔 말함"] : kind === "그대로" ? reg.label["바꿔 말함"] : reg.label.그대로;
      const r = await attempt(reg, kind, [desc], own, { followUpOnNeedMore: follow });
      runs.push(r);
      console.error(
        `${tag} 주인 ${reg.key} [${kind}] ${r.firstResult} → ${r.final} q=${r.steps.map((s) => s.quiz?.length ?? 0).join("/")}`,
      );
    }
    await flush();
  }
}

if (mode === "impostors") {
  for (const reg of regs) {
    if (stop) break;
    const label = itemLabel(reg.category, reg.sub as never);
    const colorKo = reg.color ? COLOR_LABELS[reg.color as keyof typeof COLOR_LABELS] : "흰색";
    const thumb = reg.thumb ? await readFile(join(env.STORAGE_LOCAL_DIR, reg.thumb)).catch(() => null) : null;
    const thumbPick = (q: { text: string; options: string[] }) => pick(THUMB, thumb, q);
    const a = await attempt(reg, "a 찍기", [`${label} 잃어버렸어요. 찾고 있어요.`], null);
    const b = await attempt(reg, "b 일반 특징", [`흰색 ${label}이에요. 스크래치가 조금 있고 케이스가 있어요.`], null);
    const c = await attempt(reg, "c 썸네일", [`${colorKo} ${label}이에요. 모서리에 작은 흠집이 있어요.`], thumbPick);
    // 검증 1: MK 지갑에 다른 브랜드("나이키 로고")를 적은 사칭
    const e =
      reg.key === "MK 지갑"
        ? [await attempt(reg, "e 다른 브랜드", ["파란색 나일론 지갑이에요. 나이키 로고가 있어요."], thumbPick)]
        : [];
    runs.push(a, b, c, ...e);
    for (const r of [a, b, c, ...e]) {
      console.error(`${tag} ${r.kind} ${reg.key}: ${r.final}${r.final === "PASS" ? "  <<<<< 사칭 통과" : ""}`);
      if (r.final === "PASS") console.log(`IMPOSTOR_PASS ${JSON.stringify(r)}`);
    }
    await flush();
  }
  const COLORS_KO = ["검정색", "흰색", "회색", "갈색", "분홍색"];
  const PROBES = [
    "스티커가 붙어 있어요",
    "키링이 달려 있어요",
    "이니셜이 적혀 있어요",
    "로고가 크게 있어요",
    "케이스에 무늬가 있어요",
  ];
  for (const reg of regs.slice(0, 10)) {
    if (stop) break;
    const label = itemLabel(reg.category, reg.sub as never);
    const descs = [
      ...COLORS_KO.map((c) => `${c} ${label}이에요.`),
      ...PROBES.map((_, i) => `${label}이에요. ${PROBES.slice(0, i + 1).join(". ")}.`),
    ];
    const d = await attempt(reg, "d 끈질김", descs, null, { simulateWait: true });
    runs.push(d);
    console.error(`${tag} d 끈질김 ${reg.key}: ${d.final}`);
    if (d.final === "PASS") console.log(`IMPOSTOR_PASS ${JSON.stringify(d)}`);
    await flush();
  }
}
await flush();
console.error(`done stop=${stop} aiCalls(answer sim)=${aiCalls}`);
await prisma.$disconnect();
