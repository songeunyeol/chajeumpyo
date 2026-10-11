import { z } from "zod";
import { AiFeature } from "../ai";
import { Category, FoundStatus, MatchResult, PickupMethod, PickupStatus, StorageType } from "../enums";
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
  building: BuildingSummary,
  storageType: StorageType,
  storagePlace: StoragePlaceSummary.nullable(),
  foundAt: z.iso.datetime(),
  isSeed: z.boolean(),
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
  color: z.string().nullable(),
  brand: z.string().nullable(),
  features: z.array(AiFeature),
  description: z.string().nullable(),
  isSensitive: z.boolean(),
  originalImageUrl: z.string(),
  publicImageUrl: z.string(),
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
      emailMasked: z.string(),
      method: PickupMethod,
      status: PickupStatus,
      completedAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type AdminFoundItemDetailResponse = z.infer<typeof AdminFoundItemDetailResponse>;

/** PATCH /admin/found-items/:id: 속성 고치기, 검토 대기 → 등록 */
export const AdminUpdateFoundItemRequest = z
  .object({
    category: Category.optional(),
    categoryAlt: Category.nullable().optional(),
    color: z.string().trim().max(30).nullable().optional(),
    brand: z.string().trim().max(50).nullable().optional(),
    features: z.array(AiFeature).max(10).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    /** 검토 대기 물건을 등록할 때만 */
    status: z.literal("REGISTERED").optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "바꿀 내용이 없어요." });
export type AdminUpdateFoundItemRequest = z.infer<typeof AdminUpdateFoundItemRequest>;
