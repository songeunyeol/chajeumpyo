import { z } from "zod";
import { AiFeature } from "../ai";
import {
  Category,
  ClosedReason,
  Color,
  FoundStatus,
  MAX_FEATURES,
  MatchResult,
  PickupMethod,
  PickupStatus,
  StorageType,
  SubCategory,
} from "../enums";
import { BuildingSummary } from "./buildings";
import { StoragePlaceSummary } from "./found-items";

export const ADMIN_PAGE_SIZE = 20;

/** GET /admin/found-items */
export const AdminFoundItemListQuery = z.object({
  status: FoundStatus.optional(),
  page: z.coerce.number<number>().int().min(1).default(1),
});
export type AdminFoundItemListQuery = z.infer<typeof AdminFoundItemListQuery>;

export const AdminFoundItemSummary = z.object({
  id: z.string(),
  status: FoundStatus,
  category: Category.nullable(),
  /** 세부 종류 (예: CHARGER 안의 MOUSE). 없으면 null. 화면 이름은 itemLabel(category, subCategory) */
  subCategory: SubCategory.nullable(),
  /** AI가 만든 짧은 제목. 비공개 정보가 들어가므로 관리자 화면에만 (open-issues #38) */
  title: z.string().nullable(),
  /** 주운 건물. 모르면(보관처에 맡김) 또는 확정 전이면 null */
  building: BuildingSummary.nullable(),
  floor: z.number().int().nullable(),
  /** 두 단계 등록에서 확정 전(ANALYZING)이면 null */
  storageType: StorageType.nullable(),
  storagePlace: StoragePlaceSummary.nullable(),
  foundAt: z.iso.datetime(),
  isSeed: z.boolean(),
  /** 확인 실패가 쌓여 온라인 확인을 막은 시각. 찾으러 오면 직접 본인 확인 (#29) */
  claimLockedAt: z.iso.datetime().nullable(),
  /** 관리자가 보관을 끝낸 시각과 이유. 끝내지 않았으면 null */
  closedAt: z.iso.datetime().nullable(),
  closedReason: ClosedReason.nullable(),
});
export type AdminFoundItemSummary = z.infer<typeof AdminFoundItemSummary>;

export const AdminFoundItemListResponse = z.object({
  items: z.array(AdminFoundItemSummary),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  /** 관리 범위 안의 상태별 개수 (대시보드용) */
  counts: z.partialRecord(FoundStatus, z.number().int()),
});
export type AdminFoundItemListResponse = z.infer<typeof AdminFoundItemListResponse>;

/** GET /admin/found-items/:id: 공개·비공개 정보, 원본 사진, 기록 전체 */
export const AdminFoundItemDetailResponse = AdminFoundItemSummary.extend({
  categoryAlt: Category.nullable(),
  /** 기본 12색 키 */
  color: z.string().nullable(),
  brand: z.string().nullable(),
  features: z.array(AiFeature),
  description: z.string().nullable(),
  /** 습득자가 적은 자세한 위치. 그 자리에 둠·보관처에 맡김 모두 받는다. 없으면 null */
  locationDetail: z.string().nullable(),
  /** 습득자가 적은 물건 설명(선택, 개인정보 숫자는 지운 뒤). 없으면 null */
  finderNote: z.string().nullable(),
  isSensitive: z.boolean(),
  /** 수령·기한 만료로 지웠으면 null */
  originalImageUrl: z.string().nullable(),
  publicImageUrl: z.string().nullable(),
  /** 후보 카드에 보이는 강한 블러본 */
  thumbnailUrl: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  attempts: z.array(
    z.object({
      emailMasked: z.string(),
      result: MatchResult,
      answerCorrect: z.boolean().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  reveals: z.array(z.object({ emailMasked: z.string(), revealedAt: z.iso.datetime() })),
  pickups: z.array(
    z.object({
      id: z.string(),
      /** 대면 확인 수령(IN_PERSON)은 계정이 없어 null */
      emailMasked: z.string().nullable(),
      method: PickupMethod,
      status: PickupStatus,
      completedAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
      /** 수령을 처리한 관리자 (가린 이메일). QR 수령·대면 확인 수령만 */
      processedByEmailMasked: z.string().nullable(),
      /** 대면 확인 수령의 신분 확인 메모. 수령 기록과 함께 30일 뒤 지워진다 */
      verificationNote: z.string().nullable(),
    }),
  ),
  /** 보관을 끝낸 관리자 (가린 이메일). 끝내지 않았으면 null */
  closedByEmailMasked: z.string().nullable(),
});
export type AdminFoundItemDetailResponse = z.infer<typeof AdminFoundItemDetailResponse>;

/** PATCH /admin/found-items/:id: 속성 고치기, 검토 대기 → 등록 */
export const AdminUpdateFoundItemRequest = z
  .object({
    category: Category.optional(),
    /** 세부 종류. category(바꾸면 바꾼 값)에 속해야 한다. null이면 지운다. 생략하고 종류만 바꾸면 속하지 않는 세부 종류는 지운다 */
    subCategory: SubCategory.nullable().optional(),
    categoryAlt: Category.nullable().optional(),
    color: Color.nullable().optional(),
    brand: z.string().trim().max(40).nullable().optional(),
    features: z.array(AiFeature).max(MAX_FEATURES).optional(),
    title: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    /** 검토 대기 물건을 등록할 때만 */
    status: z.literal("REGISTERED").optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "바꿀 내용이 없어요." });
export type AdminUpdateFoundItemRequest = z.infer<typeof AdminUpdateFoundItemRequest>;

/** POST /admin/found-items/:id/close: 보관 종료 (QA 10/30 3차). 행은 남기고 후보·목록에서 뺀다 */
export const AdminCloseFoundItemRequest = z.object({
  reason: ClosedReason,
});
export type AdminCloseFoundItemRequest = z.infer<typeof AdminCloseFoundItemRequest>;
