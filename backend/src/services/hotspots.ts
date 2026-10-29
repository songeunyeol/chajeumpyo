import {
  CATEGORY_LABELS,
  type Category,
  type FoundStatus,
  type HotspotPriority,
  type HotspotQuery,
  type HotspotResponse,
  type ReportHotspot,
} from "@chajeumpyo/shared";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { adminsInChargeOf, notifyUsers } from "./notifications";

/** 한국 시간 (+9, 일광 절약 시간 없음) */
const KST_OFFSET_MS = 9 * 3600_000;
const DEFAULT_DAYS = 30;
/** 가장 몰리는 구간이 이 건수보다 적으면 "데이터가 적다"고 안내 */
const MIN_INSIGHT_COUNT = 2;
/** 문구에 쓰는 시간대 폭 (2시간) */
const SLOT_HOURS = 2;
/** 우선순위 목록 최대 개수 */
const MAX_PRIORITIES = 5;

const kstDate = (d: Date) => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
/** "2026-10-01"(한국 날짜) 0시의 실제 시각 */
const kstStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS);

type Row = {
  building: string;
  hour: number;
  category: Category | null;
  isSeed: boolean;
  foundAt?: Date;
  status?: FoundStatus;
};

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

/** "오후 1시~3시", "저녁 11시~새벽 1시" */
function slotLabel(start: number): string {
  const end = (start + SLOT_HOURS) % 24;
  // 같은 때(오후~오후)면 뒤쪽 앞말을 생략: "오후 1시~3시", 다르면 그대로: "저녁 11시~새벽 1시"
  const period = (label: string) => label.split(" ")[0];
  const startLabel = hourLabel(start);
  const endFull = hourLabel(end);
  const endLabel = period(startLabel) === period(endFull) ? endFull.replace(/^\S+ /, "") : endFull;
  return `${startLabel}~${endLabel}`;
}

/** 이 분실을 포함하는 2시간 창들의 시작 시각 (r.hour-1, r.hour) */
const windowsOf = (hour: number) => Array.from({ length: SLOT_HOURS }, (_, back) => (hour - back + 24) % 24);

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
    for (const startHour of windowsOf(r.hour)) {
      const key = `${r.building}|${String(startHour).padStart(2, "0")}|${r.category}`;
      combos.set(key, (combos.get(key) ?? 0) + 1);
    }
  }
  const top = ranked(combos)[0];
  if (!top || top[1] < MIN_INSIGHT_COUNT) return "아직 데이터가 적어서 분실이 몰리는 구간을 찾지 못했어요.";
  const [building, slot, category] = top[0].split("|") as [string, string, Category];
  return `${building}에서 ${slotLabel(Number(slot))}에 ${CATEGORY_LABELS[category]} 분실이 가장 많아요.`;
}

const PERSONAL_DEVICES = new Set<Category>(["PHONE", "EARPHONE", "SMARTWATCH", "TABLET", "LAPTOP"]);
const VALUABLES = new Set<Category>([
  "WALLET",
  "ID_CARD",
  "DRIVER_LICENSE",
  "PAYMENT_CARD",
  "TRANSIT_CARD",
  "OTHER_CARD",
  "CASH",
  "KEY",
]);

/** 종류별 예방 조치 (규칙 기반 문구). 관리자가 안내문·순찰로 바로 할 수 있는 것만 */
export function preventiveAction(category: Category, building: string, slot: string): string {
  if (category === "CHARGER")
    return `${building} 콘센트 자리에 "충전기 챙기기" 안내를 붙이고, ${slot} 직후 순찰 때 콘센트를 확인해요.`;
  if (PERSONAL_DEVICES.has(category))
    return `${building} 책상·콘센트 근처에 "자리 뜨기 전 전자기기 챙기기" 안내를 붙이고, ${slot} 직후 순찰을 넣어요.`;
  if (VALUABLES.has(category))
    return `귀중품이라 그 자리에 두지 말고 교무처로 맡기도록 ${building} 출입구에 안내하고, ${slot} 직후 순찰을 넣어요.`;
  if (category === "UMBRELLA")
    return `${building} 출입구에 우산꽂이 위치를 안내하고, 비 온 날 ${slot} 뒤 우산꽂이를 정리해요.`;
  if (category === "BOOK" || category === "STATIONERY")
    return `${building} 강의실에 "수업 끝나고 책상 확인" 안내를 붙이고, ${slot} 뒤 강의실 정리 때 분실물을 모아 등록해요.`;
  if (category === "CLOTHING" || category === "HAT" || category === "BAG")
    return `${building} 의자·옷걸이 주변을 ${slot} 뒤 확인하고, 출입구에 겉옷·가방 분실 안내를 붙여요.`;
  if (category === "TUMBLER") return `${building} 정수기·휴게 공간에 "텀블러 챙기기" 안내를 붙여요.`;
  return `${building}에 ${slot} 뒤 분실물 확인 순찰을 넣고, 찾음표 등록 QR 안내를 붙여요.`;
}

/** 원형(24시간) 거리 */
const hourDistance = (a: number, b: number) => Math.min((a - b + 24) % 24, (b - a + 24) % 24);

/**
 * 먼저 손볼 구간 (반복 탐지 + 우선순위 제안).
 * - 건물 × 2시간 창 × 종류에서 2건 이상 반복된 구간만 본다. 같은 건물·종류에서 겹치는 창은 건수가 많은 하나만 남긴다.
 * - 점수 = 건수 + 보관 중인 수 × 0.5 + (최근 절반이 더 많으면 1). 5 이상 높음, 3 이상 보통, 그 밖 낮음.
 * - 기간을 반으로 나눠 뒤쪽이 많으면 늘어남(UP)으로 본다.
 */
export function buildPriorities(rows: Row[], start: Date, end: Date): HotspotPriority[] {
  const mid = start.getTime() + (end.getTime() - start.getTime()) / 2;
  /** 뒤쪽 절반의 날 수 */
  const recentDays = Math.max(1, (end.getTime() - mid) / 86_400_000);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.category) continue;
    for (const startHour of windowsOf(r.hour)) {
      const key = `${r.building}|${String(startHour).padStart(2, "0")}|${r.category}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }
  const candidates = [...groups.entries()]
    .filter(([, items]) => items.length >= MIN_INSIGHT_COUNT)
    .map(([key, items]) => {
      const [building, slot, category] = key.split("|") as [string, string, Category];
      const recent = items.filter((r) => (r.foundAt?.getTime() ?? 0) >= mid).length;
      return { key, building, startHour: Number(slot), category, items, recent };
    })
    .sort((a, b) => b.items.length - a.items.length || b.recent - a.recent || a.key.localeCompare(b.key, "ko"));

  const picked: typeof candidates = [];
  for (const c of candidates) {
    const overlaps = picked.some(
      (p) =>
        p.building === c.building && p.category === c.category && hourDistance(p.startHour, c.startHour) < SLOT_HOURS,
    );
    if (!overlaps) picked.push(c);
  }

  return picked
    .map((c) => {
      const count = c.items.length;
      const earlier = count - c.recent;
      const trend: HotspotPriority["trend"] = c.recent > earlier ? "UP" : c.recent < earlier ? "DOWN" : "SAME";
      const unclaimed = c.items.filter((r) => r.status !== "CLAIMED" && r.status !== "EXPIRED").length;
      const score = count + unclaimed * 0.5 + (trend === "UP" ? 1 : 0);
      const level: HotspotPriority["level"] = score >= 5 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";
      const slot = slotLabel(c.startHour);
      const trendText = trend === "UP" ? "늘고 있어요" : trend === "DOWN" ? "줄고 있어요" : "비슷해요";
      const expectedNextWeek = Math.round((c.recent / recentDays) * 7 * 10) / 10;
      return {
        score,
        priority: {
          building: c.building,
          startHour: c.startHour,
          category: c.category,
          count,
          recent: c.recent,
          earlier,
          trend,
          unclaimed,
          level,
          expectedNextWeek,
          summary: `${c.building} ${slot} ${CATEGORY_LABELS[c.category]} 분실 ${count}건 (최근 ${trendText}, 보관 중 ${unclaimed}건)`,
          action: preventiveAction(c.category, c.building, slot),
        },
      };
    })
    .sort((a, b) => b.score - a.score || b.priority.count - a.priority.count)
    .slice(0, MAX_PRIORITIES)
    .map((x) => x.priority);
}

type ReportRow = { building: string | null; category: Category; open: boolean };
type FoundKey = { building: string | null; category: Category | null };

/**
 * 분실 신고가 반복되는 곳. 건물 × 종류로 2건 이상 신고된 곳을 신고 많은 순으로.
 * 같은 곳·종류 습득 등록이 신고보다 적으면 "주운 물건이 들어오지 않는다"고 보고 등록 안내를 제안한다.
 */
export function buildReportHotspots(reports: ReportRow[], found: FoundKey[]): ReportHotspot[] {
  const groups = new Map<string, ReportRow[]>();
  for (const r of reports) {
    const key = `${r.building ?? ""}|${r.category}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length >= MIN_INSIGHT_COUNT)
    .map(([key, rows]) => {
      const [b, category] = key.split("|") as [string, Category];
      const building = b || null;
      const open = rows.filter((r) => r.open).length;
      const foundCount = found.filter(
        (f) => f.category === category && (building === null || f.building === building),
      ).length;
      const where = building ?? "건물 모름";
      const label = CATEGORY_LABELS[category];
      const action =
        foundCount < rows.length
          ? `찾는 신고보다 들어온 물건이 적어요. ${building ?? "건물"} 출입구·강의실에 "주운 물건은 사진 한 장으로 등록" QR 안내를 붙여요.`
          : `들어온 물건은 있어요. 신고자에게 후보 확인을 안내하고, 못 찾은 신고는 교무처에서 직접 확인해요.`;
      return {
        building,
        category,
        reports: rows.length,
        open,
        found: foundCount,
        summary: `${where} ${label} 분실 신고 ${rows.length}건 (못 찾음 ${open}건, 같은 곳 습득 등록 ${foundCount}건)`,
        action,
      };
    })
    .sort((a, b) => b.reports - a.reports || b.open - a.open || a.summary.localeCompare(b.summary, "ko"))
    .slice(0, MAX_PRIORITIES);
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
           f.is_seed AS "isSeed",
           f.found_at AS "foundAt",
           f.status::text AS status
    FROM found_item f JOIN building b ON b.id = f.building_id
    WHERE f.found_at >= ${start} AND f.found_at < ${end}`;

  const reports = await prisma.$queryRaw<ReportRow[]>`
    SELECT b.name AS building, r.category::text AS category, (r.status = 'OPEN') AS open
    FROM lost_report r JOIN "user" u ON u.id = r.user_id LEFT JOIN building b ON b.id = r.building_id
    WHERE u.role <> 'DEMO' AND r.created_at >= ${start} AND r.created_at < ${end}`;

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
    priorities: buildPriorities(rows, start, end),
    reportHotspots: buildReportHotspots(reports, real),
  };
}

/** 같은 구간 알림을 다시 보내지 않는 기간 */
const ALERT_COOLDOWN_DAYS = 7;
const ALERT_PREFIX = "반복 분실 알림 · ";

/**
 * 새 등록으로 그 건물·종류 구간이 "높음"이 되면 맡은 관리자에게 미리 알린다 (불편이 문제가 되기 전에).
 * 같은 구간은 7일에 한 번만. 시드·건물 없는 물건은 보지 않는다. 보낸 알림 수를 돌려준다.
 */
export async function alertHotspot(foundItemId: string, now = new Date()): Promise<number> {
  const item = await prisma.foundItem.findUnique({
    where: { id: foundItemId },
    select: { isSeed: true, category: true, storagePlaceId: true, building: { select: { name: true } } },
  });
  if (!item || item.isSeed || !item.category || !item.building) return 0;
  const { priorities, isSeedData } = await hotspots({}, now);
  if (isSeedData) return 0;
  const hit = priorities.find(
    (p) => p.level === "HIGH" && p.building === item.building?.name && p.category === item.category,
  );
  if (!hit) return 0;
  const key = `${ALERT_PREFIX}${hit.building} ${slotLabel(hit.startHour)} ${CATEGORY_LABELS[hit.category]} 분실`;
  const recent = await prisma.notification.findFirst({
    where: {
      type: "SYSTEM",
      message: { startsWith: key },
      createdAt: { gte: new Date(now.getTime() - ALERT_COOLDOWN_DAYS * 86_400_000) },
    },
    select: { id: true },
  });
  if (recent) return 0;
  const admins = await adminsInChargeOf(item.storagePlaceId);
  await notifyUsers(admins, {
    type: "SYSTEM",
    foundItemId,
    message: `${ALERT_PREFIX}${hit.summary}. 제안: ${hit.action}`,
  });
  return admins.length;
}

/** 등록 흐름에서 부를 때: 실패해도 throw하지 않고 로그만 남긴다 */
export function alertHotspotSafely(foundItemId: string): Promise<void> {
  return alertHotspot(foundItemId).then(
    (sent) => {
      if (sent > 0) logger.info({ foundItemId, sent }, "반복 분실 알림");
    },
    (err) => logger.error({ err, foundItemId }, "반복 분실 알림 실패"),
  );
}
