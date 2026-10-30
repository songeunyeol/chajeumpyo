// 결과보고서 2.1 그래프(에브리타임 주운 사람 글 35건) SVG를 만든다. 의존성 없음.
// 실행: node docs/charts/make-charts.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";
const SOURCE = "출처: 에브리타임 서경대 게시판, 주운 사람 글 35건, 팀 직접 집계 2026-10-30";
const C = { office: "#2f7d5b", shop: "#e0a43a", keep: "#c4553f", leave: "#8a8f98", none: "#c9ccd1" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** 가로 막대(여러 조각) 그래프. rows: [{ label, parts: [{ value, color, name }] }] */
function bars({ title, rows, total, legend }) {
  const W = 760, left = 190, right = 120, rowH = 46, top = 70;
  const H = top + rows.length * rowH + 70;
  const max = Math.max(...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0)));
  const scale = (W - left - right) / max;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`;
  svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  svg += `<text x="24" y="38" font-size="20" font-weight="700" fill="#1d2433">${esc(title)}</text>`;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    svg += `<text x="${left - 12}" y="${y + 22}" font-size="15" text-anchor="end" fill="#1d2433">${esc(r.label)}</text>`;
    let x = left;
    let sum = 0;
    for (const p of r.parts) {
      const w = p.value * scale;
      svg += `<rect x="${x}" y="${y + 6}" width="${w}" height="26" rx="3" fill="${p.color}"/>`;
      if (r.parts.length > 1 && w > 28) svg += `<text x="${x + w / 2}" y="${y + 24}" font-size="12" text-anchor="middle" fill="#ffffff">${p.value}</text>`;
      x += w;
      sum += p.value;
    }
    const pct = total ? ` (${Math.round((sum / total) * 100)}%)` : "";
    svg += `<text x="${x + 8}" y="${y + 24}" font-size="15" font-weight="700" fill="#1d2433">${sum}건${pct}</text>`;
  });
  let lx = 24;
  const ly = H - 40;
  for (const l of legend) {
    svg += `<rect x="${lx}" y="${ly - 11}" width="12" height="12" rx="2" fill="${l.color}"/>`;
    svg += `<text x="${lx + 18}" y="${ly}" font-size="12" fill="#4a5161">${esc(l.name)}</text>`;
    lx += 18 + l.name.length * 12 + 18;
  }
  svg += `<text x="24" y="${H - 14}" font-size="11" fill="#6b7280">${esc(SOURCE)}</text></svg>\n`;
  return svg;
}

const handling = bars({
  title: "주운 물건을 어떻게 했나 (35건)",
  total: 35,
  rows: [
    { label: "어딘가에 맡김", parts: [{ value: 14, color: C.office }, { value: 7, color: C.shop }] },
    { label: "주운 사람이 보관", parts: [{ value: 6, color: C.keep }] },
    { label: "그 자리에 둠·안 적음", parts: [{ value: 6, color: C.leave }, { value: 2, color: C.none }] },
  ],
  legend: [
    { name: "학교 기관·공용 장소", color: C.office },
    { name: "상점(편의점·카페)", color: C.shop },
    { name: "쪽지로 연락", color: C.keep },
    { name: "그 자리에 둠", color: C.leave },
    { name: "안 적음", color: C.none },
  ],
});

const place = bars({
  title: "맡긴 곳 (21건)",
  rows: [
    { label: "교무처·교무과(혜인관)", parts: [{ value: 9, color: C.office }] },
    { label: "교내 편의점", parts: [{ value: 3, color: C.shop }] },
    { label: "청운관 상황실", parts: [{ value: 2, color: C.office }] },
    { label: "유담관 카페", parts: [{ value: 2, color: C.shop }] },
    { label: "학교 밖 카페", parts: [{ value: 2, color: C.shop }] },
    { label: "학술정보관 7층", parts: [{ value: 1, color: C.office }] },
    { label: "학생처", parts: [{ value: 1, color: C.office }] },
    { label: "총학생회 부스", parts: [{ value: 1, color: C.office }] },
  ],
  legend: [
    { name: "학교 기관·공용 장소", color: C.office },
    { name: "상점", color: C.shop },
  ],
});

writeFileSync(join(OUT, "eta-handling.svg"), handling);
writeFileSync(join(OUT, "eta-handin-places.svg"), place);
console.log("docs/charts/eta-handling.svg, docs/charts/eta-handin-places.svg");
