import { z } from "zod";
import { AiFeature } from "../ai";
import {
  Category,
  Color,
  FoundStatus,
  MAX_FEATURES,
  MatchResult,
  PickupMethod,
  PickupStatus,
  StorageType,
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
  /** AI가 만든 짧은 제목. 비공개 정보가 들어가므로 관리자 화면에만 (open-issues #38) */
  title: z.string().nullable(),
  building: BuildingSummary,
  floor: z.number().int().nullable(),
  storageType: StorageType,
  storagePlace: StoragePlaceSummary.nullable(),
  foundAt: z.iso.datetime(),
  isSeed: z.boolean(),
  /** 확인 실패가 쌓여 온라인 확인을 막은 시각. 찾으러 오면 직접 본인 확인 (#29) */
  claimLockedAt: z.iso.datetime().nullable(),
  /**
   * 목록 행 썸네일: 공개본(민감하면 이미 흐린 사진)의 서명 URL, 10분. 원본은 목록에 절대 넣지 않는다.
   * 수령·기한 만료로 사진을 지웠거나 없으면 null. (상세 응답에서는 같은 이름이 후보용 블러본을 가리킨다)
   */
  thumbnailUrl: z.string().nullable(),
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
  isSensitive: z.boolean(),
  /** 수령·기한 만료로 지웠으면 null */
  originalImageUrl: z.string().nullable(),
  publicImageUrl: z.string().nullable(),
  /** 상세에서는 후보 카드에 보이는 강한 블러본 (목록의 thumbnailUrl과 다름) */
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
});
export type AdminFoundItemDetailResponse = z.infer<typeof AdminFoundItemDetailResponse>;

/** PATCH /admin/found-items/:id: 속성 고치기, 검토 대기 → 등록 */
export const AdminUpdateFoundItemRequest = z
  .object({
    category: Category.optional(),
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
