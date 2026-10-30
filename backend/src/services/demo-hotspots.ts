import type { Category, FoundStatus, HotspotQuery, HotspotResponse } from "@chajeumpyo/shared";
import { computeHotspots, hotspotRange, type ReportRow, type Row } from "./hotspots";

/**
 * 관리자 시연용 데이터. DB에 넣지 않고 메모리에만 있다.
 * 날짜는 "오늘로부터 며칠 전"이라 언제 열어도 같은 모양이다. 90일에 걸쳐 있어 7·30·90일 결과가 서로 다르다.
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
  // 90일을 한 학기처럼 짰다: 60~89일 전은 방학이라 드물고, 0~59일 전(학기 중)에 몰린다.
  // 분포는 에브리타임 집계(지갑·카드 최다, 혜인관·북악관·유담관 순)를 흉내 냈다. 실제 학생 데이터가 아니다.

  // 유담관 점심 직후 충전기: 최근에 몰림 → 30일·7일 모두 늘어남, 높음
  F(1, 13, "유담관", "CHARGER"),
  F(3, 14, "유담관", "CHARGER"),
  F(6, 13, "유담관", "CHARGER"),
  F(9, 14, "유담관", "CHARGER", "CLAIMED"),
  F(18, 13, "유담관", "CHARGER", "CLAIMED"),
  F(24, 14, "유담관", "CHARGER", "CLAIMED"),
  F(35, 13, "유담관", "CHARGER", "CLAIMED"),
  F(48, 14, "유담관", "CHARGER", "EXPIRED"),
  // 혜인관 점심 지갑·카드: 학기 내내 꾸준함 → 90일로 보면 가장 많음
  F(4, 12, "혜인관", "WALLET"),
  F(13, 12, "혜인관", "PAYMENT_CARD", "CLAIMED"),
  F(20, 13, "혜인관", "WALLET", "CLAIMED"),
  F(27, 12, "혜인관", "WALLET", "CLAIMED"),
  F(33, 12, "혜인관", "WALLET", "CLAIMED"),
  F(41, 13, "혜인관", "WALLET", "CLAIMED"),
  F(52, 12, "혜인관", "WALLET", "CLAIMED"),
  F(84, 12, "혜인관", "WALLET", "EXPIRED"),
  // 혜인관 저녁 우산: 비 온 주에 몰렸다가 줄어듦
  F(5, 18, "혜인관", "UMBRELLA"),
  F(19, 18, "혜인관", "UMBRELLA", "CLAIMED"),
  F(22, 19, "혜인관", "UMBRELLA", "CLAIMED"),
  F(26, 18, "혜인관", "UMBRELLA", "CLAIMED"),
  F(38, 19, "혜인관", "UMBRELLA", "EXPIRED"),
  F(44, 18, "혜인관", "UMBRELLA", "CLAIMED"),
  // 북악관 오후 이어폰: 최근 늘어남
  F(2, 15, "북악관", "EARPHONE"),
  F(8, 15, "북악관", "EARPHONE"),
  F(11, 16, "북악관", "EARPHONE", "CLAIMED"),
  F(29, 15, "북악관", "EARPHONE", "CLAIMED"),
  F(55, 15, "북악관", "EARPHONE", "CLAIMED"),
  // 한 번씩만 나온 것 (반복 아님)
  F(0, 10, "본관", "WALLET"),
  F(7, 11, "유담관", "BOOK"),
  F(12, 12, "혜인관", "EARPHONE", "CLAIMED"),
  F(10, 16, "혜인관", "TUMBLER"),
  F(14, 17, "본관", "CLOTHING"),
  F(15, 13, "북악관", "PHONE", "CLAIMED"),
  F(16, 10, "북악관", "STATIONERY"),
  F(17, 14, "한림관", "HAT"),
  F(21, 9, "청운관", "KEY", "CLAIMED"),
  F(23, 20, "생활관", "PAYMENT_CARD", "CLAIMED"),
  F(31, 11, "청운관", "BOOK", "CLAIMED"),
  F(46, 21, "생활관", "TRANSIT_CARD", "CLAIMED"),
  F(58, 10, "대일관", "STATIONERY", "EXPIRED"),
  // 방학 (60~89일 전)
  F(63, 20, "생활관", "PAYMENT_CARD", "CLAIMED"),
  F(70, 14, "유담관", "BOOK", "EXPIRED"),
  F(76, 17, "본관", "UMBRELLA", "EXPIRED"),
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
