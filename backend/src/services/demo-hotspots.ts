import type { Category, FoundStatus, HotspotQuery, HotspotResponse } from "@chajeumpyo/shared";
import { computeHotspots, hotspotRange, type ReportRow, type Row } from "./hotspots";

/**
 * 관리자 시연용 데이터. DB에 넣지 않고 메모리에만 있다.
 * 날짜는 "오늘로부터 며칠 전"이라 언제 열어도 최근 30일 안에 들어온다.
 * 실제 학생 데이터가 아니고, 실제 통계와 같은 집계 함수(computeHotspots)로 계산한다.
 */
type DemoFound = { daysAgo: number; hour: number; building: string; category: Category; status: FoundStatus };

const F = (
  daysAgo: number,
  hour: number,
  building: string,
  category: Category,
  status: FoundStatus = "REGISTERED",
) => ({
  daysAgo,
  hour,
  building,
  category,
  status,
});

export const DEMO_FOUND: DemoFound[] = [
  // 유담관 점심 직후 충전기: 최근 절반에 몰림 → 높음
  F(2, 13, "유담관", "CHARGER"),
  F(4, 14, "유담관", "CHARGER"),
  F(6, 13, "유담관", "CHARGER"),
  F(9, 14, "유담관", "CHARGER", "CLAIMED"),
  F(18, 13, "유담관", "CHARGER", "CLAIMED"),
  F(24, 14, "유담관", "CHARGER", "CLAIMED"),
  // 혜인관 저녁 우산: 예전에 더 많았음 → 보통
  F(5, 18, "혜인관", "UMBRELLA"),
  F(19, 18, "혜인관", "UMBRELLA", "CLAIMED"),
  F(22, 19, "혜인관", "UMBRELLA", "CLAIMED"),
  // 본관 오전 지갑
  F(3, 10, "본관", "WALLET"),
  F(20, 10, "본관", "WALLET", "CLAIMED"),
  // 한 번씩만 나온 것 (반복 아님)
  F(1, 15, "유담관", "EARPHONE"),
  F(7, 11, "유담관", "BOOK"),
  F(12, 12, "혜인관", "EARPHONE", "CLAIMED"),
  F(8, 16, "혜인관", "TUMBLER"),
  F(14, 17, "본관", "CLOTHING"),
  F(10, 13, "북악관", "PHONE", "CLAIMED"),
  F(16, 10, "북악관", "STATIONERY"),
  F(11, 14, "한림관", "HAT"),
  F(21, 9, "청운관", "KEY", "CLAIMED"),
];

type DemoReport = { building: string | null; category: Category; open: boolean };

export const DEMO_REPORTS: DemoReport[] = [
  // 혜인관 이어폰 신고는 4건인데 들어온 물건은 1건 → 등록 안내 제안
  { building: "혜인관", category: "EARPHONE", open: true },
  { building: "혜인관", category: "EARPHONE", open: true },
  { building: "혜인관", category: "EARPHONE", open: true },
  { building: "혜인관", category: "EARPHONE", open: false },
  // 유담관 충전기 신고 2건, 들어온 물건은 충분함
  { building: "유담관", category: "CHARGER", open: true },
  { building: "유담관", category: "CHARGER", open: false },
  { building: null, category: "WALLET", open: true },
];

/** 한국 날짜 to에서 daysAgo일 전 hour시 20분 (한국 시간)의 실제 시각 */
const kstAt = (to: string, daysAgo: number, hour: number) =>
  new Date(Date.parse(`${to}T${String(hour).padStart(2, "0")}:20:00+09:00`) - daysAgo * 86_400_000);

/** GET /demo/admin/stats/hotspots. 기간은 실제 통계와 같은 규칙이고, 기간 밖 시연 데이터는 빠진다. */
export function demoHotspots(query: HotspotQuery, now = new Date()): HotspotResponse {
  const range = hotspotRange(query, now);
  const rows: Row[] = DEMO_FOUND.map((f) => ({
    building: f.building,
    hour: f.hour,
    category: f.category,
    isSeed: true,
    foundAt: kstAt(range.to, f.daysAgo, f.hour),
    status: f.status,
  })).filter((r) => r.foundAt >= range.start && r.foundAt < range.end);
  const reports: ReportRow[] = DEMO_REPORTS.map((r) => ({ ...r }));
  return computeHotspots(range, rows, reports, rows, true);
}
