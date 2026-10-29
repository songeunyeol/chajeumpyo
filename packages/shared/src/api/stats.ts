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
  /**
   * 다음 7일 예상 건수. 기간 뒤쪽 절반의 하루 평균 × 7 (소수 첫째 자리).
   * 모델 예측이 아니라 최근 추세를 그대로 이어 본 값이다
   */
  expectedNextWeek: z.number(),
  /** 한 문장 요약 */
  summary: z.string(),
  /** 제안하는 예방 조치 */
  action: z.string(),
});
export type HotspotPriority = z.infer<typeof HotspotPriority>;

/**
 * 분실 신고가 반복되는 곳 (10/29). 분실 신고(학생 민원)를 건물 × 종류로 묶어 2건 이상인 곳을 찾고,
 * 같은 곳·종류의 습득 등록 수와 견줘 "찾는 사람은 많은데 들어오는 물건이 적은 곳"을 드러낸다. 체험 계정 신고는 뺀다.
 */
export const ReportHotspot = z.object({
  /** 건물을 모른다고 한 신고는 null */
  building: z.string().nullable(),
  category: Category,
  reports: z.number().int(),
  /** 아직 열려 있는(못 찾은) 신고 수 */
  open: z.number().int(),
  /** 같은 기간·건물·종류의 습득 등록 수 (건물 모름이면 종류만) */
  found: z.number().int(),
  summary: z.string(),
  action: z.string(),
});
export type ReportHotspot = z.infer<typeof ReportHotspot>;

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
  /** 분실 신고가 반복되는 곳, 신고 많은 순 최대 5개 */
  reportHotspots: z.array(ReportHotspot),
});
export type HotspotResponse = z.infer<typeof HotspotResponse>;
