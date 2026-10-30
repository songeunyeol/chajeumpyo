// QA 10/30 3차: 층 표기가 사용자 화면은 "지하 1층", 관리자 화면은 "-1층"으로 달랐다
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { floorLabel } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/** 화면 파일 안의 `floorLabel` 화살표 함수를 꺼내 실행한다 */
function frontendFloorLabel(path: string): (f: number | null | undefined) => string {
  const src = read(path);
  const m = src.match(/floorLabel\s*[:=]\s*(\(f\)\s*=>[^\n]*?)[,;]?\s*\n/);
  if (!m?.[1]) throw new Error(`${path}에 floorLabel이 없어요`);
  return new Function(`return ${m[1]};`)() as (f: number | null | undefined) => string;
}

describe("층 표기 통일", () => {
  const cases = [-2, -1, 1, 2, 10, null, undefined];

  it("shared: 지하는 '지하 N층', 모르면 빈 글자", () => {
    expect(floorLabel(-1)).toBe("지하 1층");
    expect(floorLabel(3)).toBe("3층");
    expect(floorLabel(null)).toBe("");
  });

  it.each(["frontend/admin/admin.js", "frontend/lost/api.js"])("%s의 floorLabel이 shared와 같다", (path) => {
    const f = frontendFloorLabel(path);
    for (const c of cases) expect(f(c)).toBe(floorLabel(c));
  });

  it("관리자 화면이 층을 숫자 그대로(-1층) 붙이지 않는다", () => {
    const admin = read("frontend/admin/admin.js");
    expect(admin).not.toMatch(/\$\{item\.floor\}층/);
    expect(admin).toMatch(/floorLabel\(item\.floor\)/);
  });
});
