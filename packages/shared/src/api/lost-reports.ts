import { z } from "zod";
import { Category, ReportStatus } from "../enums";
import { BuildingSummary } from "./buildings";

/** 분실 설명 길이 (초안) */
export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 500;

const Description = z
  .string()
  .trim()
  .min(DESCRIPTION_MIN, `설명은 ${DESCRIPTION_MIN}자 이상 적어 주세요.`)
  .max(DESCRIPTION_MAX, `설명은 ${DESCRIPTION_MAX}자 이하로 적어 주세요.`);

/** POST /lost-reports */
export const CreateLostReportRequest = z
  .object({
    category: Category,
    lostFrom: z.iso.datetime({ offset: true }),
    lostTo: z.iso.datetime({ offset: true }),
    /** 모르면 생략 */
    buildingId: z.number().int().positive().optional(),
    description: Description,
  })
  .superRefine((v, ctx) => {
    const from = Date.parse(v.lostFrom);
    const to = Date.parse(v.lostTo);
    if (from > to) ctx.addIssue({ code: "custom", path: ["lostTo"], message: "끝 시각이 시작 시각보다 빨라요." });
    // 기기 시계 차이를 감안해 5분까지는 허용
    if (to > Date.now() + 5 * 60_000) {
      ctx.addIssue({ code: "custom", path: ["lostTo"], message: "아직 오지 않은 시각이에요." });
    }
  });
export type CreateLostReportRequest = z.infer<typeof CreateLostReportRequest>;

/** PATCH /lost-reports/:id: 닫기 또는 설명 고치기 */
export const UpdateLostReportRequest = z
  .object({
    status: z.literal("CLOSED").optional(),
    description: Description.optional(),
  })
  .refine((v) => v.status !== undefined || v.description !== undefined, { message: "바꿀 내용이 없어요." });
export type UpdateLostReportRequest = z.infer<typeof UpdateLostReportRequest>;

export const LostReportIdParams = z.object({ id: z.uuid() });

/** 후보 한 개. 공개 정보만 담는다. 배열 순서는 습득 시각 최신순이고 점수와 관계없다. */
export const Candidate = z.object({
  foundItemId: z.string(),
  category: Category,
  foundAt: z.iso.datetime(),
  building: BuildingSummary,
  /** 이 물건에 남은 확인 시도 횟수 */
  attemptsLeft: z.number().int().min(0),
  locked: z.boolean(),
  isSeed: z.boolean(),
});
export type Candidate = z.infer<typeof Candidate>;

/** POST /lost-reports 201, PATCH /lost-reports/:id 200 */
export const LostReportWithCandidates = z.object({
  id: z.string(),
  status: ReportStatus,
  candidates: z.array(Candidate),
});
export type LostReportWithCandidates = z.infer<typeof LostReportWithCandidates>;

/** GET /lost-reports/:id/candidates */
export const CandidateListResponse = z.object({ candidates: z.array(Candidate) });
export type CandidateListResponse = z.infer<typeof CandidateListResponse>;

/** GET /lost-reports */
export const LostReportListResponse = z.object({
  reports: z.array(
    z.object({
      id: z.string(),
      category: Category,
      status: ReportStatus,
      description: z.string(),
      lostFrom: z.iso.datetime(),
      lostTo: z.iso.datetime(),
      building: BuildingSummary.nullable(),
      candidateCount: z.number().int(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type LostReportListResponse = z.infer<typeof LostReportListResponse>;
