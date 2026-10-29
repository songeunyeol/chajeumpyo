import { z } from "zod";
import { Category } from "../enums";

/** 집계 기간 최대 길이(일) */
export const HOTSPOT_MAX_DAYS = 366;

const Day = z.iso.date();

/** GET /admin/stats/hotspots: 한국 시간 날짜, 양 끝 포함. 생략하면 최근 30일 */
export const HotspotQuery = z.object({ from: Day.optional(), to: Day.optional() }).superRefine((v, ctx) => {
  if (v.from && v.to) {
    const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000;
    if (days < 0) ctx.addIssue({ code: "custom", path: ["to"], message: "끝 날짜가 시작 날짜보다 빨라요." });
    if (days >= HOTSPOT_MAX_DAYS)
      ctx.addIssue({ code: "custom", path: ["to"], message: "기간은 1년 이내로 골라 주세요." });
  }
});
export type HotspotQuery = z.infer<typeof HotspotQuery>;

/**
 * 먼저 손볼 분실 다발 구간 (F-15 확장, 10/29). 건물 × 2시간 × 종류로 반복되는 분실을 찾아
 * 건수·최근 추세·아직 주인을 못 찾은 수로 우선순위를 매기고 예방 조치를 제안한다.
 */
export const HotspotPriority = z.object({
  building: z.string(),
  /** 2시간 창의 시작 시각(0~23, 한국 시간) */
  startHour: z.number().int().min(0).max(23),
  category: Category,
  count: z.number().int(),
  /** 기간 뒤쪽 절반의 건수와 앞쪽 절반의 건수 */
  recent: z.number().int(),
  earlier: z.number().int(),
  trend: z.enum(["UP", "SAME", "DOWN"]),
  /** 아직 수령되지 않은(보관 중인) 물건 수 */
  unclaimed: z.number().int(),
  level: z.enum(["HIGH", "MEDIUM", "LOW"]),
  /** 한 문장 요약 */
  summary: z.string(),
  /** 제안하는 예방 조치 */
  action: z.string(),
});
export type HotspotPriority = z.infer<typeof HotspotPriority>;

export const HotspotResponse = z.object({
  from: Day,
  to: Day,
  /** 실제 데이터가 없어 시드 데이터로 집계했으면 true. 화면에 "시드 집계" 표시 */
  isSeedData: z.boolean(),
  total: z.number().int(),
  byBuilding: z.array(z.object({ building: z.string(), count: z.number().int() })),
  /** 0~23시, 한국 시간 */
  byHour: z.array(z.object({ hour: z.number().int().min(0).max(23), count: z.number().int() })),
  byCategory: z.array(z.object({ category: Category, count: z.number().int() })),
  /** 가장 몰리는 건물·시간대·종류를 한 문장으로 */
  topInsight: z.string(),
  /** 먼저 손볼 구간, 우선순위 높은 순 최대 5개. 반복(2건 이상)이 없으면 빈 배열 */
  priorities: z.array(HotspotPriority),
});
export type HotspotResponse = z.infer<typeof HotspotResponse>;
