// 종류 인식 정확도 채점 (실제 AI). 파일 이름 앞부분을 정답으로 보고, 서비스와 같은 순서(정리 → 가리기 → AI)로 돌린다.
// npm run eval:categories -w backend -- [사진 폴더] (기본 ~/Desktop/chajeumpyo-test-photos)
// 파일 이름 예: 마우스_1.jpg, 백팩-2.jpg, 우산3.jpg, 무선 이어폰_1.jpg → 세부 종류 이름이나 큰 종류 이름으로 정답을 찾는다.
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
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
  return file
    .slice(0, -extname(file).length)
    .split(/[_\-(]/)[0]!
    .replace(/\d+$/, "")
    .trim();
}

const dir = process.argv[2] ?? join(homedir(), "Desktop", "chajeumpyo-test-photos");
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
  ms: number;
};
const rows: Row[] = [];
for (const file of files) {
  const expected = lookup.get(squash(nameOf(file))) ?? null;
  const started = Date.now();
  let got = "";
  let catOk: boolean | null = null;
  let subOk: boolean | null = null;
  try {
    const original = await normalizeImage(await readFile(join(dir, file)));
    const masked = await premaskSafely(original);
    if (!masked) throw new Error("가리기 실패 (서비스에서는 AI로 보내지 않는다)");
    const ex = await withTimeout(ai.extractFoundItem(masked.image, "image/jpeg"), 60_000, "AI");
    got = ex.hasObject
      ? `${itemLabel(ex.category, ex.subCategory)} (${ex.category}${ex.subCategory ? `/${ex.subCategory}` : ""})`
      : "물건 없음";
    if (expected) {
      catOk = ex.hasObject && ex.category === expected.category;
      subOk = expected.sub ? catOk && ex.subCategory === expected.sub : null;
    }
  } catch (err) {
    got = `오류: ${(err as Error).message.slice(0, 80)}`;
    if (expected) catOk = false;
  }
  const ms = Date.now() - started;
  rows.push({ file, expected, got, catOk, subOk, ms });
  const mark = catOk === null ? "?" : catOk && subOk !== false ? "✓" : "✗";
  const want = expected ? itemLabel(expected.category, expected.sub) : `정답 모름("${nameOf(file)}")`;
  console.log(`${mark} ${file.padEnd(24)} 정답 ${want.padEnd(10)} → ${got}  ${(ms / 1000).toFixed(1)}s`);
}

const scored = rows.filter((r) => r.catOk !== null);
const subScored = rows.filter((r) => r.subOk !== null);
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}% (${n}/${d})` : "-");
const times = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`
큰 종류 정확도   ${pct(scored.filter((r) => r.catOk).length, scored.length)}
세부 종류 정확도 ${pct(subScored.filter((r) => r.subOk).length, subScored.length)}  (정답에 세부 종류가 있는 사진만)
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
