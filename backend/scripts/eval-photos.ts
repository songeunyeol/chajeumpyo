// 실제 사진 평가: 팀이 찍은 분실물 사진으로 종류 인식·가리기·후보 순위·주인 확인을 한 번에 잰다.
// 실행 (평가용 DB에서만. 운영 DB에서 돌리지 않는다. 사진과 정답 파일은 레포 밖에 둔다):
//   npm run db:deploy -w backend && npm run db:seed -w backend
//   AI_MODE=gemini npm run eval:photos -w backend -- <사진 폴더> --labels <정답.json> --out <결과 폴더> > 결과.md
// 정답 파일: photos는 사진 번호(파일 이름 끝 숫자 3자리)별 허용 정답, items는 물건마다 대표 사진·건물·종류와
// 분실 신고 설명 두 가지(그대로 / 바꿔 말함). 가린 사진은 <결과 폴더>/masked에 저장해 눈으로 확인한다.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { type Category, CONSENT_VERSION, itemLabel } from "@chajeumpyo/shared";
import { ai } from "../src/ai";
import { env } from "../src/config/env";
import { normalizeImage } from "../src/lib/image";
import { prisma } from "../src/lib/prisma";
import { findCandidates } from "../src/matching/candidates";
import { quizOf } from "../src/matching/quiz";
import { premaskSafely } from "../src/privacy/premask";
import { answer, claim } from "../src/services/claims";
import { seedDemoItems } from "../src/services/demo-seed";
import { registerFoundItem } from "../src/services/found-items";
import { createLostReport } from "../src/services/lost-reports";

if (env.NODE_ENV === "production") {
  console.error("운영 환경에서는 돌리지 않아요.");
  process.exit(1);
}

type PhotoLabel = { cat: string[]; sub: (string | null)[]; color: string[] };
type ItemLabel = { key: string; photo: string; building: string; category: Category } & Record<Kind, string>;
type Kind = "그대로" | "바꿔 말함";
const KINDS: Kind[] = ["그대로", "바꿔 말함"];

const { values: opts, positionals } = parseArgs({
  options: { labels: { type: "string" }, out: { type: "string" } },
  allowPositionals: true,
});
const dir = positionals[0];
if (!dir || !opts.labels || !opts.out) {
  console.error("사용법: eval:photos -- <사진 폴더> --labels <정답.json> --out <결과 폴더>");
  process.exit(1);
}
const labels = JSON.parse(await readFile(opts.labels, "utf8")) as {
  photos: Record<string, PhotoLabel>;
  items: ItemLabel[];
};
await mkdir(join(opts.out, "masked"), { recursive: true });
const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f)).sort();
const numOf = (f: string) => f.slice(0, -extname(f).length).match(/(\d{3})$/)?.[1] ?? "";
const fileOf = new Map(files.map((f) => [numOf(f), f]));

/** 잠깐 몰린 것(과부하·분당 제한)이면 한 번 쉬었다 다시 */
async function retry<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (err) {
    if (!/\b(429|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test((err as Error).message)) throw err;
    await sleep(15_000);
    return f();
  }
}

// 1. 종류·색 인식과 가리기 (서비스와 같은 순서: 정리 → 가리기 → AI)
console.log("## 1. 종류·색 인식, 가리기\n");
console.log("| 사진 | AI 결과 | 큰 종류 | 세부 종류 | 색 | 가린 얼굴·글자 | 민감 표시 |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
let catOk = 0;
let subOk = 0;
let subN = 0;
let colorOk = 0;
for (const [num, label] of Object.entries(labels.photos)) {
  const file = fileOf.get(num);
  if (!file) {
    console.log(`| ${num} | 사진 없음 | - | - | - | - | - |`);
    continue;
  }
  const original = await normalizeImage(await readFile(join(dir, file)));
  const masked = await premaskSafely(original);
  if (!masked) {
    console.log(`| ${num} | 가리기 실패 | ✗ | - | - | - | - |`);
    continue;
  }
  await writeFile(join(opts.out, "masked", `${num}.jpg`), masked.image);
  const ex = await retry(() => ai.extractFoundItem(masked.image, "image/jpeg"));
  const c = ex.hasObject && label.cat.includes(ex.category);
  const wantsSub = label.sub.some((s) => s !== null);
  const s = c && label.sub.includes(ex.subCategory ?? null);
  const col = ex.hasObject && label.color.includes(ex.color ?? "");
  catOk += c ? 1 : 0;
  if (wantsSub) {
    subN++;
    subOk += s ? 1 : 0;
  }
  colorOk += col ? 1 : 0;
  const got = ex.hasObject ? `${itemLabel(ex.category, ex.subCategory)} · ${ex.color} · ${ex.title}` : "물건 없음";
  console.log(
    `| ${num} | ${got} | ${c ? "✓" : "✗"} | ${wantsSub ? (s ? "✓" : "✗") : "-"} | ${col ? "✓" : "✗"} | ${masked.faces}·${masked.texts} | ${ex.isSensitive ? `예(${ex.sensitiveRegions.length}곳)` : "아니오"} |`,
  );
}
const n = Object.keys(labels.photos).length;
console.log(`\n- 큰 종류 ${catOk}/${n}, 세부 종류 ${subOk}/${subN}, 색 ${colorOk}/${n}\n`);

// 2. 후보 순위와 주인 확인: 체험 시드 14개에 실제 사진 물건을 습득물로 섞고, 설명 두 가지로 신고한다
const now = new Date();
await seedDemoItems(now);
const place = await prisma.storagePlace.findFirstOrThrow({ where: { isActive: true } });
const registered = new Map<string, string>();
for (const [i, item] of labels.items.entries()) {
  const file = fileOf.get(item.photo);
  const building = await prisma.building.findUniqueOrThrow({ where: { name: item.building } });
  if (!file) continue;
  const image = await readFile(join(dir, file));
  const res = await retry(() =>
    registerFoundItem({
      image,
      fields: {
        buildingId: building.id,
        storageType: "HANDED_OVER",
        storagePlaceId: place.id,
        consentVersion: CONSENT_VERSION,
        consentExternalAi: true,
        consentLocation: false,
      } as Parameters<typeof registerFoundItem>[0]["fields"],
      fingerprint: `eval-photos-${Date.now()}-${i}`,
    }),
  );
  // 체험 계정 후보는 시드만 보여 주므로(진짜 물건과 섞이지 않게), 평가용 DB에서는 시드로 표시해 함께 줄 세운다
  await prisma.foundItem.update({ where: { id: res.id }, data: { isSeed: true } });
  registered.set(item.key, res.id);
  console.error(`등록 ${item.key}: ${res.status} ${res.category ?? "-"}`);
}

console.log("## 2. 후보 순위·주인 확인\n");
console.log("| 물건 | 설명 | 1등 | 3개 안 | 1단계 판정 | 최종 |");
console.log("| --- | --- | --- | --- | --- | --- |");
type Row = { kind: Kind; top1: boolean; top3: boolean; final: string };
const rows: Row[] = [];
let k = 0;
for (const item of labels.items) {
  const id = registered.get(item.key);
  if (!id) continue;
  const building = await prisma.building.findUniqueOrThrow({ where: { name: item.building } });
  for (const kind of KINDS) {
    k++;
    const user = await prisma.user.create({
      data: { email: `photo-${Date.now()}-${k}@skuniv.ac.kr`, passwordHash: "x", role: "DEMO" },
    });
    const viewer = { userId: user.id, role: "DEMO" as const };
    const created = await retry(() =>
      createLostReport(viewer, {
        category: item.category,
        lostFrom: new Date(now.getTime() - 10 * 3600_000).toISOString(),
        lostTo: new Date().toISOString(),
        buildingId: building.id,
        description: item[kind],
      }),
    );
    const report = await prisma.lostReport.findUniqueOrThrow({ where: { id: created.id } });
    const ours = (await findCandidates(report, "DEMO")).sort((a, b) => b.score.total - a.score.total);
    const top1 = ours[0]?.foundItemId === id;
    const top3 = created.candidates.some((c) => c.foundItemId === id);
    let first = "후보 아님";
    let final = "후보 아님";
    if (top3) {
      const r = await retry(() => claim(viewer, created.id, id));
      first = r.result;
      final = r.result;
      if (r.result === "BORDERLINE") {
        const attempt = await prisma.matchAttempt.findUniqueOrThrow({ where: { id: r.attemptId } });
        const quiz = quizOf(attempt.matchedFields);
        final = quiz.length
          ? `질문 ${quiz.length}개 → ${(await answer(viewer, r.attemptId, { choices: quiz.map((q) => q.answer) })).result}`
          : "질문(서술형)";
      }
    }
    rows.push({ kind, top1, top3, final });
    console.log(
      `| ${item.key} | ${kind} | ${top1 ? "예" : "아니오"} | ${top3 ? "예" : "아니오"} | ${first} | ${final} |`,
    );
  }
}
console.log("\n| 설명 | 건수 | 1등 | 3개 안 | 주인 확인 최종 통과 |");
console.log("| --- | --- | --- | --- | --- |");
for (const kind of [...KINDS, "전체"] as const) {
  const r = kind === "전체" ? rows : rows.filter((x) => x.kind === kind);
  const c = (f: (x: Row) => boolean) => `${r.filter(f).length}/${r.length}`;
  console.log(
    `| ${kind} | ${r.length} | ${c((x) => x.top1)} | ${c((x) => x.top3)} | ${c((x) => x.final === "PASS" || x.final.endsWith("PASS"))} |`,
  );
}
await prisma.$disconnect();
