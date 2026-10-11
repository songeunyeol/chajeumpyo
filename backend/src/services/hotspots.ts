import { CATEGORY_LABELS, type Category, type HotspotQuery, type HotspotResponse } from "@chajeumpyo/shared";
import { prisma } from "../lib/prisma";

/** 한국 시간 (+9, 일광 절약 시간 없음) */
const KST_OFFSET_MS = 9 * 3600_000;
const DEFAULT_DAYS = 30;
/** 가장 몰리는 구간이 이 건수보다 적으면 "데이터가 적다"고 안내 */
const MIN_INSIGHT_COUNT = 2;
/** 문구에 쓰는 시간대 폭 (2시간) */
const SLOT_HOURS = 2;

const kstDate = (d: Date) => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
/** "2026-10-01"(한국 날짜) 0시의 실제 시각 */
const kstStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS);

type Row = { building: string; hour: number; category: Category | null; isSeed: boolean };

function countBy<K extends string | number>(rows: Row[], key: (r: Row) => K | null) {
  const map = new Map<K, number>();
  for (const r of rows) {
    const k = key(r);
    if (k !== null) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/** 많은 순, 같으면 이름(값) 순. 같은 입력엔 항상 같은 순서 */
function ranked<K extends string | number>(map: Map<K, number>) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ko"));
}

function hourLabel(h: number): string {
  if (h === 0) return "밤 12시";
  if (h < 6) return `새벽 ${h}시`;
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  if (h < 18) return `오후 ${h - 12}시`;
  return `저녁 ${h - 12}시`;
}

/**
 * "학술정보관에서 오후 1시~3시에 충전기·보조배터리 분실이 가장 많아요."
 * 시간대는 1시간씩 밀어 가며 2시간 창을 본다. 고정 칸(12~14시, 14~16시)으로 나누면
 * 13시와 14시에 몰린 분실이 두 칸으로 갈라져 엉뚱한 시간대가 뽑힌다.
 */
export function buildInsight(rows: Row[]): string {
  const combos = new Map<string, number>();
  for (const r of rows) {
    if (!r.category) continue;
    // 이 분실을 포함하는 창: 시작이 r.hour-1, r.hour인 두 창
    for (let back = 0; back < SLOT_HOURS; back++) {
      const startHour = (r.hour - back + 24) % 24;
      const key = `${r.building}|${String(startHour).padStart(2, "0")}|${r.category}`;
      combos.set(key, (combos.get(key) ?? 0) + 1);
    }
  }
  const top = ranked(combos)[0];
  if (!top || top[1] < MIN_INSIGHT_COUNT) return "아직 데이터가 적어서 분실이 몰리는 구간을 찾지 못했어요.";
  const [building, slot, category] = top[0].split("|") as [string, string, Category];
  const start = Number(slot);
  const end = (start + SLOT_HOURS) % 24;
  // 같은 때(오후~오후)면 뒤쪽 앞말을 생략: "오후 1시~3시", 다르면 그대로: "저녁 11시~새벽 1시"
  const period = (label: string) => label.split(" ")[0];
  const startLabel = hourLabel(start);
  const endFull = hourLabel(end);
  const endLabel = period(startLabel) === period(endFull) ? endFull.replace(/^\S+ /, "") : endFull;
  return `${building}에서 ${startLabel}~${endLabel}에 ${CATEGORY_LABELS[category]} 분실이 가장 많아요.`;
}

/** GET /admin/stats/hotspots (F-15). 실제 데이터만 집계하고, 없으면 시드 데이터로 집계해 표시한다. */
export async function hotspots(query: HotspotQuery, now = new Date()): Promise<HotspotResponse> {
  const to = query.to ?? kstDate(now);
  const from = query.from ?? kstDate(new Date(kstStart(to).getTime() - (DEFAULT_DAYS - 1) * 86_400_000));
  const start = kstStart(from);
  const end = new Date(kstStart(to).getTime() + 86_400_000);

  const all = await prisma.$queryRaw<Row[]>`
    SELECT b.name AS building,
           EXTRACT(HOUR FROM (f.found_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::int AS hour,
           f.category::text AS category,
           f.is_seed AS "isSeed"
    FROM found_item f JOIN building b ON b.id = f.building_id
    WHERE f.found_at >= ${start} AND f.found_at < ${end}`;

  const real = all.filter((r) => !r.isSeed);
  const isSeedData = real.length === 0 && all.length > 0;
  const rows = isSeedData ? all : real;

  return {
    from,
    to,
    isSeedData,
    total: rows.length,
    byBuilding: ranked(countBy(rows, (r) => r.building)).map(([building, count]) => ({ building, count })),
    byHour: ranked(countBy(rows, (r) => r.hour)).map(([hour, count]) => ({ hour, count })),
    byCategory: ranked(countBy(rows, (r) => r.category)).map(([category, count]) => ({ category, count })),
    topInsight: buildInsight(rows),
  };
}
