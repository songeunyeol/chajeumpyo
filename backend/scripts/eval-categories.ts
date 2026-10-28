// 종류 인식 정확도 채점 (실제 AI). 파일 이름 앞부분을 정답으로 보고, 서비스와 같은 순서(정리 → 가리기 → AI)로 돌린다.
// npm run eval:categories -w backend -- [사진 폴더] [--delay 초] (기본 ~/Desktop/chajeumpyo-test-photos, 사진 사이 대기 0초)
// AI 호출 오류(사용량 초과·과부하)는 틀림이 아니라 "확인 못 함"으로 따로 세고, 정확도에서 뺀다.
// 하루 사용량을 다 쓰면(429, PerDay 한도) 그 자리에서 멈추고 지금까지 결과만 낸다.
// 참고: 기본 모델이 실패하면 대체 모델로 다시 묻기 때문에(서비스와 같음) 결과는 "기본 + 대체" 합친 정확도다.
// 제한 시간은 60초로 넉넉히 둬서, 서비스(AI_TIMEOUT_MS, 기본 8초)보다 느린 응답도 정확도에는 들어간다. 걸린 시간 값으로 따로 본다.
// 파일 이름 예: 마우스_1.jpg, 백팩-2.jpg, 우산3.jpg, 무선 이어폰_1.jpg → 세부 종류 이름이나 큰 종류 이름으로 정답을 찾는다.
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  CATEGORY_LABELS,
  Category,
  itemLabel,
  SUB_CATEGORIES,
  SUB_CATEGORY_LABELS,
  type SubCategory,
} from "@chajeumpyo/shared";
import { ai } from "../src/ai";
import { env } from "../src/config/env";
import { withTimeout } from "../src/lib/async";
import { normalizeImage } from "../src/lib/image";
import { premaskSafely } from "../src/privacy/premask";

type Expected = { category: Category; sub: SubCategory | null };

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 이름 → 정답. 세부 종류 이름, 큰 종류 이름, "·"로 나눈 조각, 영문 키를 모두 받는다 */
function buildLookup(): Map<string, Expected> {
  const map = new Map<string, Expected>();
  const add = (name: string, e: Expected) => {
    const key = squash(name);
    if (key && !map.has(key)) map.set(key, e);
  };
  for (const [category, subs] of Object.entries(SUB_CATEGORIES) as [Category, SubCategory[]][]) {
    for (const sub of subs) {
      const e = { category, sub };
      add(sub, e);
      add(SUB_CATEGORY_LABELS[sub], e);
      for (const part of SUB_CATEGORY_LABELS[sub].split("·")) add(part, e);
    }
  }
  for (const category of Category.options) {
    const e = { category, sub: null };
    add(category, e);
    add(CATEGORY_LABELS[category], e);
    for (const part of CATEGORY_LABELS[category].split("·")) add(part, e);
  }
  // 자주 쓰는 다른 이름
  for (const [alias, e] of [
    ["에어팟", { category: "EARPHONE", sub: "WIRELESS_EARBUDS" }],
    ["버즈", { category: "EARPHONE", sub: "WIRELESS_EARBUDS" }],
    ["이어폰", { category: "EARPHONE", sub: null }],
    ["학생증", { category: "ID_CARD", sub: null }],
    ["카드", { category: "PAYMENT_CARD", sub: null }],
    ["시계", { category: "ACCESSORY", sub: "WRISTWATCH" }],
    ["물병", { category: "TUMBLER", sub: null }],
  ] as [string, Expected][])
    add(alias, e);
  return map;
}

/** "마우스_1.jpg" → "마우스" (밑줄·하이픈·괄호·숫자 앞까지) */
function nameOf(file: string): string {
  return (
    file
      .slice(0, -extname(file).length)
      .split(/[_\-(]/)[0]
      ?.replace(/\d+$/, "")
      .trim() ?? ""
  );
}

const { values: opts, positionals } = parseArgs({
  options: { delay: { type: "string", default: "0" } },
  allowPositionals: true,
});
const dir = positionals[0] ?? join(homedir(), "Desktop", "chajeumpyo-test-photos");
const delayMs = Math.max(0, Number(opts.delay) || 0) * 1000;
/** 하루 사용량 초과. 더 돌려도 모두 실패하므로 멈춘다 */
const isQuotaExhausted = (msg: string) => msg.includes("429") && /PerDay/i.test(msg);
/** 잠깐 몰린 것(과부하·분당 제한). 한 번 쉬었다 다시 해 본다 */
const isTransient = (msg: string) => /\b(429|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg);
/** 호출 자체가 안 된 것(사용량·과부하·시간 초과·연결). 모델이 형식에 안 맞는 답을 낸 것(ZodError·JSON 깨짐)은
 * 서비스에서도 검토 대기(실패)가 되므로 여기 넣지 않고 틀림으로 센다 */
const isCallFailure = (msg: string) =>
  isTransient(msg) || /시간 초과|timeout|fetch failed|ECONN|ENOTFOUND|network/i.test(msg);
const lookup = buildLookup();
const files = (await readdir(dir)).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())).sort();
if (files.length === 0) {
  console.error(`사진이 없어요: ${dir}\n파일 이름에 정답을 넣어 주세요. 예: 마우스_1.jpg, 백팩_2.jpg`);
  process.exit(1);
}
console.log(`AI_MODE=${env.AI_MODE}, 모델 ${env.GEMINI_MODEL ?? "-"}, 사진 ${files.length}장, 폴더 ${dir}\n`);

type Row = {
  file: string;
  expected: Expected | null;
  got: string;
  catOk: boolean | null;
  subOk: boolean | null;
  /** AI 호출이 실패해 판정하지 못함 (정확도에서 뺀다) */
  aiError: boolean;
  ms: number;
};

/** AI 호출. 걸린 시간은 성공한 호출만 잰다(재시도 전 대기는 빼고) */
async function extract(image: Buffer) {
  const once = async () => {
    const t = Date.now();
    const ex = await withTimeout(ai.extractFoundItem(image, "image/jpeg"), 60_000, "AI");
    return { ex, aiMs: Date.now() - t };
  };
  try {
    return await once();
  } catch (err) {
    const msg = (err as Error).message;
    if (isQuotaExhausted(msg) || !isTransient(msg)) throw err;
    await sleep(15_000);
    return once();
  }
}
const rows: Row[] = [];
let stoppedForQuota = false;
for (const [i, file] of files.entries()) {
  if (i > 0 && delayMs) await sleep(delayMs);
  const expected = lookup.get(squash(nameOf(file))) ?? null;
  let aiMs = 0;
  let got = "";
  let catOk: boolean | null = null;
  let subOk: boolean | null = null;
  let aiError = false;
  try {
    const original = await normalizeImage(await readFile(join(dir, file)));
    const masked = await premaskSafely(original);
    if (!masked) throw new Error("가리기 실패 (서비스에서는 AI로 보내지 않는다)");
    let ex: Awaited<ReturnType<typeof extract>>["ex"];
    try {
      ({ ex, aiMs } = await extract(masked.image));
    } catch (err) {
      aiError = isCallFailure((err as Error).message);
      throw err;
    }
    got = ex.hasObject
      ? `${itemLabel(ex.category, ex.subCategory)} (${ex.category}${ex.subCategory ? `/${ex.subCategory}` : ""})`
      : "물건 없음";
    if (expected) {
      catOk = ex.hasObject && ex.category === expected.category;
      subOk = expected.sub ? catOk && ex.subCategory === expected.sub : null;
    }
  } catch (err) {
    const msg = (err as Error).message;
    got = `오류: ${msg.slice(0, 80)}`;
    // 가리기 실패·AI 응답 형식 오류는 서비스에서도 실패라 틀림으로 세고, 호출 자체가 안 된 것만 판정에서 뺀다
    if (expected && !aiError) catOk = false;
    if (aiError && isQuotaExhausted(msg)) stoppedForQuota = true;
  }
  const ms = aiMs;
  rows.push({ file, expected, got, catOk, subOk, aiError, ms });
  const mark = aiError ? "!" : catOk === null ? "?" : catOk && subOk !== false ? "✓" : "✗";
  const want = expected ? itemLabel(expected.category, expected.sub) : `정답 모름("${nameOf(file)}")`;
  console.log(`${mark} ${file.padEnd(24)} 정답 ${want.padEnd(10)} → ${got}  ${(ms / 1000).toFixed(1)}s`);
  if (stoppedForQuota) {
    console.log("\nAI 하루 사용량을 다 써서 멈췄어요. 결제를 켜거나 내일 다시 돌려 주세요.");
    break;
  }
}

const scored = rows.filter((r) => r.catOk !== null);
const subScored = rows.filter((r) => r.subOk !== null);
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "-");
const times = rows
  .filter((r) => !r.aiError && r.ms > 0)
  .map((r) => r.ms)
  .sort((a, b) => a - b);
const aiErrors = rows.filter((r) => r.aiError).length;
console.log(`
큰 종류 정확도   ${pct(scored.filter((r) => r.catOk).length, scored.length)}
세부 종류 정확도 ${pct(subScored.filter((r) => r.subOk).length, subScored.length)}  (정답에 세부 종류가 있는 사진만)
AI 오류로 못 본 사진 ${aiErrors}장, 돌리지 못한 사진 ${files.length - rows.length}장 (둘 다 정확도에서 뺐어요)
걸린 시간       중앙값 ${((times[Math.floor(times.length / 2)] ?? 0) / 1000).toFixed(1)}s, 최대 ${((times.at(-1) ?? 0) / 1000).toFixed(1)}s`);
const unknown = rows.filter((r) => !r.expected);
if (unknown.length) console.log(`정답을 못 읽은 파일 ${unknown.length}장: ${unknown.map((r) => r.file).join(", ")}`);
const wrong = rows.filter((r) => r.catOk === false || r.subOk === false);
if (wrong.length) {
  console.log("\n틀린 사진:");
  for (const r of wrong)
    console.log(
      `  ${r.file}: 정답 ${itemLabel((r.expected as Expected).category, (r.expected as Expected).sub)} → ${r.got}`,
    );
}
