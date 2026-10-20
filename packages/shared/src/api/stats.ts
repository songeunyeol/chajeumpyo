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
});
export type HotspotResponse = z.infer<typeof HotspotResponse>;
