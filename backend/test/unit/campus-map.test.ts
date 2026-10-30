import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

type Highlight = { name: string; label: string; kind: "here" | "office" };
type CampusMap = {
  CAMPUS_BUILDINGS: Record<string, { lat: number; lng: number }>;
  CAMPUS_MAP_PIXELS: Record<string, [number, number]>;
  campusPoint: (name: string) => { x: number; y: number } | null;
  resolveHighlights: (
    loc: { buildingName: string },
    opts: { highlights?: { name: string; label?: string; kind?: string }[]; office?: boolean },
  ) => Highlight[];
};

/** 화면 스크립트를 DOM 없이 읽는다. 함수 정의와 window 등록만 한다 */
function loadCampusMap(): CampusMap {
  const window: { NaverCampusMap?: CampusMap } = {};
  new Function("window", read("frontend/naver-map.js"))(window);
  if (!window.NaverCampusMap) throw new Error("NaverCampusMap 없음");
  return window.NaverCampusMap;
}

const seed = JSON.parse(read("backend/prisma/seed-data/buildings.json")) as {
  name: string;
  lat: number;
  lng: number;
}[];

describe("캠퍼스 지도 (QA 10/30 B17)", () => {
  const map = loadCampusMap();

  it("시드 건물마다 그림 핀이 있고 좌표가 시드와 같다", () => {
    for (const b of seed) {
      expect(map.CAMPUS_MAP_PIXELS[b.name], b.name).toBeDefined();
      expect(map.CAMPUS_BUILDINGS[b.name], b.name).toEqual({ lat: b.lat, lng: b.lng });
      const p = map.campusPoint(b.name);
      expect(p, b.name).not.toBeNull();
      expect(p?.x).toBeGreaterThan(0);
      expect(p?.x).toBeLessThan(100);
      expect(p?.y).toBeGreaterThan(0);
      expect(p?.y).toBeLessThan(100);
    }
  });

  it("휴대폰 폭(지도 약 328px)에서 핀끼리 20px 넘게 떨어진다", () => {
    const shown = 328;
    const pins = Object.entries(map.CAMPUS_MAP_PIXELS);
    const crop = 1760;
    for (const [a, [ax, ay]] of pins) {
      for (const [b, [bx, by]] of pins) {
        if (a >= b) continue;
        const dist = (Math.hypot(ax - bx, ay - by) * shown) / crop;
        expect(dist, `${a}–${b}`).toBeGreaterThan(20);
      }
    }
  });

  it("강조: 기본은 고른 건물, 교무처를 더하면 혜인관, 같은 건물은 이름을 합친다", () => {
    expect(map.resolveHighlights({ buildingName: "북악관" }, {})).toEqual([
      { name: "북악관", label: "북악관", kind: "here" },
    ]);
    expect(map.resolveHighlights({ buildingName: "북악관" }, { office: true })).toEqual([
      { name: "북악관", label: "북악관", kind: "here" },
      { name: "혜인관", label: "교무처", kind: "office" },
    ]);
    expect(map.resolveHighlights({ buildingName: "혜인관" }, { highlights: [], office: true })).toEqual([
      { name: "혜인관", label: "교무처", kind: "office" },
    ]);
    expect(
      map.resolveHighlights(
        { buildingName: "혜인관" },
        { highlights: [{ name: "혜인관", kind: "here" }], office: true },
      ),
    ).toEqual([{ name: "혜인관", label: "혜인관 · 교무처", kind: "here" }]);
    // 그림에 따로 없는 중앙도서관은 유담관 핀으로
    expect(map.resolveHighlights({ buildingName: "중앙도서관" }, {})[0]?.name).toBe("유담관");
  });

  it("홈·완료·확인 통과 화면이 여러 핀 지도를 쓴다", () => {
    expect(read("frontend/index.html")).toContain('highlights: [{ name: "혜인관", label: "교무처", kind: "office" }]');
    expect(read("frontend/lost/home.html")).toContain("office: true");
    expect(read("frontend/found/done-handover.html")).toContain("office: true");
    const handover = read("frontend/lost/item-handover.html");
    expect(handover).toContain('<script src="../naver-map.js"></script>');
    expect(handover).toContain('id="itemMapBox"');
    expect(handover).toContain("office: true");
    // 기본은 캠퍼스맵 그림. 위성 사진은 눌렀을 때만 불러온다
    expect(read("frontend/naver-map.js")).toContain('toggle.textContent = "위성 사진"');
  });
});
