import { z } from "zod";
import { Category, FoundStatus, StorageType } from "../enums";
import { BuildingSummary } from "./buildings";

/** 이미지 최대 용량(MB). 프론트는 업로드 전에 이보다 작게 줄인다. */
export const MAX_IMAGE_MB = 10;

/** POST /found-items (multipart/form-data)의 이미지 외 필드 */
export const RegisterFoundItemFields = z
  .object({
    buildingId: z.coerce.number<number>().int().positive(),
    storageType: StorageType,
    storagePlaceId: z.coerce.number<number>().int().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.storageType === "HANDED_OVER" && v.storagePlaceId === undefined) {
      ctx.addIssue({ code: "custom", path: ["storagePlaceId"], message: "맡긴 보관처를 골라 주세요." });
    }
    if (v.storageType === "IN_PLACE" && v.storagePlaceId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["storagePlaceId"],
        message: "그 자리에 둔 물건은 보관처를 고르지 않아요.",
      });
    }
  });
export type RegisterFoundItemFields = z.infer<typeof RegisterFoundItemFields>;

export const StoragePlaceSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  guideText: z.string(),
});
export type StoragePlaceSummary = z.infer<typeof StoragePlaceSummary>;

/** POST /found-items 201 응답. 공개 정보만 담는다. */
export const RegisterFoundItemResponse = z.object({
  id: z.string(),
  /** REGISTERED: 등록 완료, REVIEW: AI 분석 실패로 관리자 확인 대기 */
  status: FoundStatus,
  /** REVIEW면 null */
  category: Category.nullable(),
  building: BuildingSummary,
  storageType: StorageType,
  storagePlace: StoragePlaceSummary.nullable(),
  /** REVIEW일 때 안내 문구 */
  message: z.string().nullable(),
});
export type RegisterFoundItemResponse = z.infer<typeof RegisterFoundItemResponse>;
