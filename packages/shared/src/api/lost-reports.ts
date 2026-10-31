import { z } from "zod";
import { Category, Color, ReportStatus, StorageType, SubCategory } from "../enums";
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

/**
 * 후보 근거. 공개 정보(종류·건물·습득 시각)와 신고자 본인이 적은 값만으로 만든다.
 * 색·특징·2순위 종류 같은 비공개 정보는 근거에 쓰지 않는다 (open-issues #28).
 */
export const CandidateReason = z.enum(["SAME_CATEGORY", "RELATED_CATEGORY", "SAME_BUILDING", "FOUND_SOON_AFTER"]);
export type CandidateReason = z.infer<typeof CandidateReason>;

export const CANDIDATE_REASON_LABELS: Record<CandidateReason, string> = {
  SAME_CATEGORY: "같은 종류",
  RELATED_CATEGORY: "연관 종류",
  SAME_BUILDING: "같은 건물",
  FOUND_SOON_AFTER: "잃어버린 시간 근처에 주웠어요",
};

/** 후보 한 개. 공개 정보만 담는다. 배열 순서는 습득 시각 최신순이고 점수와 관계없다. */
export const Candidate = z.object({
  foundItemId: z.string(),
  category: Category,
  /** 세부 종류 (예: 마우스). 없으면 null */
  subCategory: SubCategory.nullable(),
  foundAt: z.iso.datetime(),
  /** 주운 건물. 보관처에 맡겼고 주운 곳을 모르면 null */
  building: BuildingSummary.nullable(),
  /** 층은 넣지 않는다: 확인 전에 그 자리에 둔 물건의 자리를 좁혀 주지 않게. 층은 판정 통과 후 상세에서만 */
  /** 숨은 특징을 알아볼 수 없을 만큼 강하게 흐린 사진 (서명 URL, 10분). 사진이 없으면 null */
  thumbnailUrl: z.string().nullable(),
  /** 공개 정보로만 만든 근거. 점수나 순위는 담지 않는다 */
  reasons: z.array(CandidateReason),
  /** 이 물건에 남은 확인 시도 횟수 (이 계정 기준). 대면 확인만 되면 0 */
  attemptsLeft: z.number().int().min(0),
  /** 온라인 확인 불가 (이 계정이 횟수를 다 썼거나, 물건이 대면 확인으로 넘어감) */
  locked: z.boolean(),
  /** 이 계정이 확인을 통과했다. 교무처에서 QR로 수령 완료하기 전까지 신고는 OPEN */
  awaitingPickup: z.boolean(),
  /** 모든 계정의 실패가 쌓여 대면 확인만 되는 물건 (#29) */
  inPersonOnly: z.boolean(),
  isSeed: z.boolean(),
});
export type Candidate = z.infer<typeof Candidate>;

/**
 * AI가 신고자 본인의 설명에서 읽은 것. 화면에 "AI가 이렇게 읽었어요"로 보여 준다.
 * 신고자가 직접 적은 내용에서 나온 값만 담는다(습득물의 숨은 특징은 담지 않는다).
 */
export const ReportAiRead = z.object({
  category: Category,
  subCategory: SubCategory.nullable(),
  color: Color.nullable(),
  brand: z.string().nullable(),
  /** 설명에서 뽑은 특징 문구 (신고자 표현 그대로). 예: "냥이 열쇠고리" */
  features: z.array(z.object({ key: z.string(), value: z.string() })),
});
export type ReportAiRead = z.infer<typeof ReportAiRead>;

/** POST /lost-reports 201, PATCH /lost-reports/:id 200 */
export const LostReportWithCandidates = z.object({
  id: z.string(),
  status: ReportStatus,
  candidates: z.array(Candidate),
  /** AI 분석 결과가 없거나 형식이 다르면 null */
  aiRead: ReportAiRead.nullable(),
});
export type LostReportWithCandidates = z.infer<typeof LostReportWithCandidates>;

/** GET /lost-reports/:id/candidates */
export const CandidateListResponse = z.object({ candidates: z.array(Candidate), aiRead: ReportAiRead.nullable() });
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
      /**
       * 이 신고로 확인을 통과한 물건의 수령 상태. 통과한 물건이 없으면 null.
       * PASSED: 통과했고 아직 QR 없음(또는 만료) · QR_ISSUED: 쓸 수 있는 수령 QR이 있음 · COMPLETED: 수령 완료.
       * 목록에서 QR 화면으로 바로 보내거나(보관처에 맡긴 물건) 수령 완료 카드를 누를 수 없게 하는 데 쓴다.
       */
      pickup: z
        .object({
          foundItemId: z.string(),
          storageType: StorageType.nullable(),
          status: z.enum(["PASSED", "QR_ISSUED", "COMPLETED"]),
        })
        .nullable(),
    }),
  ),
});
export type LostReportListResponse = z.infer<typeof LostReportListResponse>;
