import { Category, CreateLostReportRequest, DESCRIPTION_MAX } from "@chajeumpyo/shared";
import { z } from "zod";

/** "YYYY-MM-DDTHH:mm" (datetime-local 값) */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export type When = "today" | "yesterday" | "custom";

/** 빠른 선택 → 시작·끝 (기기 시간대 기준) */
export function rangeFor(when: When, now = new Date()): { from: Date; to: Date } | null {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (when === "today") return { from: start, to: now };
  if (when === "yesterday") {
    const y = new Date(start.getTime() - 86_400_000);
    return { from: y, to: new Date(start.getTime() - 60_000) };
  }
  return null;
}

/** 화면 입력 모양. 보낼 때 shared CreateLostReportRequest로 바꿔 그 스키마로 검증한다 */
export const ReportFormSchema = z
  .object({
    category: z.enum(Category.options, { message: "잃어버린 물건 종류를 골라 주세요." }),
    when: z.enum(["today", "yesterday", "custom"]),
    lostFrom: z.string(),
    lostTo: z.string(),
    buildingId: z.number().int().positive().optional(),
    unknownBuilding: z.boolean(),
    description: z.string().max(DESCRIPTION_MAX, `설명은 ${DESCRIPTION_MAX}자 이하로 적어 주세요.`),
  })
  .transform((v): z.input<typeof CreateLostReportRequest> => {
    const r = rangeFor(v.when);
    const from = r ? r.from : new Date(v.lostFrom);
    const to = r ? r.to : new Date(v.lostTo);
    const buildingId = v.unknownBuilding ? undefined : v.buildingId;
    return {
      category: v.category,
      lostFrom: Number.isNaN(from.getTime()) ? "" : from.toISOString(),
      lostTo: Number.isNaN(to.getTime()) ? "" : to.toISOString(),
      ...(buildingId !== undefined ? { buildingId } : {}),
      description: v.description,
    };
  })
  .pipe(CreateLostReportRequest);

export type ReportFormInput = z.input<typeof ReportFormSchema>;
export type ReportFormOutput = z.output<typeof ReportFormSchema>;
