import { z } from "zod";
import { Category, FoundStatus, StorageType, SubCategory } from "../enums";
import { BuildingSummary } from "./buildings";
import { FinderConsentFields } from "./consent";

/** 이미지 최대 용량(MB). 프론트는 업로드 전에 이보다 작게 줄인다. */
export const MAX_IMAGE_MB = 10;

/** 자세한 위치 설명 최대 길이 */
export const LOCATION_DETAIL_MAX = 200;

/** 그 자리에 둔 물건의 자세한 위치 최소 길이. 주인이 이 설명을 보고 찾아간다 (QA 10/31) */
export const LOCATION_DETAIL_MIN = 4;

/** 주운 곳과 보관 방식. 한 번에 등록(POST /found-items)과 두 단계 등록의 확정(confirm)이 같이 쓴다 */
const FoundPlaceFields = z.object({
  /** 주운 건물. 그 자리에 두면 필수, 보관처에 맡기면 모를 때 비운다 */
  buildingId: z.coerce.number<number>().int().positive().optional(),
  storageType: StorageType,
  storagePlaceId: z.coerce.number<number>().int().positive().optional(),
  /** 습득 층. 지하는 음수(B1 = -1), 모르면 비움 */
  floor: z.coerce.number<number>().int().min(-10).max(30).optional(),
  /** 자세한 위치 (예: 3층 엘리베이터 앞 벤치 위). 판정을 통과한 사람에게만 보인다. 빈 문자열은 없는 것으로 본다 */
  locationDetail: z
    .string()
    .trim()
    .max(LOCATION_DETAIL_MAX, `자세한 위치는 ${LOCATION_DETAIL_MAX}자 이내로 적어 주세요.`)
    .optional()
    .transform((v) => v || undefined),
});

function checkPlace(v: z.infer<typeof FoundPlaceFields>, ctx: z.RefinementCtx) {
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
  if (v.storageType === "IN_PLACE" && v.buildingId === undefined) {
    ctx.addIssue({ code: "custom", path: ["buildingId"], message: "물건을 둔 건물을 골라 주세요." });
  }
  if (v.storageType === "IN_PLACE" && (v.locationDetail?.length ?? 0) < LOCATION_DETAIL_MIN) {
    ctx.addIssue({
      code: "custom",
      path: ["locationDetail"],
      message: `그 자리에 두면 어디에 뒀는지 ${LOCATION_DETAIL_MIN}자 이상 적어 주세요.`,
    });
  }
}

/** POST /found-items (multipart/form-data)의 이미지 외 필드. 사진·위치를 한 번에 보낸다 */
export const RegisterFoundItemFields = FoundPlaceFields.extend(FinderConsentFields.shape).superRefine(checkPlace);
export type RegisterFoundItemFields = z.infer<typeof RegisterFoundItemFields>;

/** POST /found-items/analyze (multipart/form-data)의 이미지 외 필드. 두 단계 등록의 1단계: 사진만 먼저 */
export const AnalyzeFoundItemFields = FinderConsentFields;
export type AnalyzeFoundItemFields = z.infer<typeof AnalyzeFoundItemFields>;

/** POST /found-items/analyze 201 응답 */
export const AnalyzeFoundItemResponse = z.object({
  id: z.string(),
  /** 확정(confirm)할 때 같이 보낸다. 이 값을 가진 기기만 확정할 수 있다 */
  confirmToken: z.string(),
  /** AI가 알아본 종류. 분석이 실패하면 null이고 확정하면 관리자 검토 대기(REVIEW)가 된다 */
  category: Category.nullable(),
  /** 세부 종류 (예: CHARGER 안의 MOUSE). 없으면 null. 화면 이름은 itemLabel(category, subCategory) */
  subCategory: SubCategory.nullable(),
  /** 귀중품이면 true. 등록 화면은 보관처에 맡김을 기본으로 두고, 그 자리에 둠을 고르면 보관처를 추천한다 (10/30 정책 변경, QA B11) */
  isValuable: z.boolean(),
  /** 분석 실패 안내 문구. 성공하면 null */
  message: z.string().nullable(),
  /** 이때까지 확정하지 않으면 사진과 초안을 지운다 */
  confirmBy: z.iso.datetime(),
});
export type AnalyzeFoundItemResponse = z.infer<typeof AnalyzeFoundItemResponse>;

/** POST /found-items/:id/confirm (JSON): 두 단계 등록의 2단계. 응답은 POST /found-items와 같다 */
export const ConfirmFoundItemBody = FoundPlaceFields.extend({
  confirmToken: z.string().min(1).max(200),
  /** 습득자가 고친 종류. AI가 잘못 알아봤을 때만 보낸다(생략하면 AI 결과 그대로) */
  category: Category.optional(),
  /** 습득자가 고친 세부 종류. category와 같이 보내고, 그 종류에 속하지 않으면 무시한다 */
  subCategory: SubCategory.nullable().optional(),
  /**
   * 습득자가 적은 물건 설명 (선택). 공개하지 않고 비공개 상세에만 둔다.
   * 사진 분석을 보강하고, 사진 분석이 실패하면 이 글로 종류를 정한다. 전화번호·메일·학번 같은 숫자는 서버가 지운다
   */
  note: z.string().trim().max(200).optional(),
}).superRefine(checkPlace);
export type ConfirmFoundItemBody = z.infer<typeof ConfirmFoundItemBody>;

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
  /** 세부 종류. 없으면 null */
  subCategory: SubCategory.nullable(),
  /** 주운 건물. 보관처에 맡겼고 모르면 null */
  building: BuildingSummary.nullable(),
  floor: z.number().int().nullable(),
  storageType: StorageType,
  storagePlace: StoragePlaceSummary.nullable(),
  /** REVIEW일 때 안내 문구 */
  message: z.string().nullable(),
  /**
   * 예전 고가품 안내 (open-issues #32 P0). 보관처 추천은 등록 화면이 확정 전에 직접 보여 주므로(10/30)
   * 늘 null이다. 응답 호환을 위해 필드만 남긴다
   */
  handOverAdvice: z
    .object({
      message: z.string(),
      storagePlaces: z.array(StoragePlaceSummary.extend({ building: BuildingSummary, sameBuilding: z.boolean() })),
    })
    .nullable(),
});
export type RegisterFoundItemResponse = z.infer<typeof RegisterFoundItemResponse>;

export const FoundItemIdParams = z.object({ id: z.uuid() });

/** GET /found-items/:id/detail: 일치 판정을 통과한 계정에게만 (F-10) */
export const FoundItemDetailResponse = z.object({
  id: z.string(),
  category: Category,
  /** 세부 종류. 없으면 null */
  subCategory: SubCategory.nullable(),
  color: z.string().nullable(),
  /** 공개본(민감하면 블러) 서명 URL. 10분 뒤 만료 */
  imageUrl: z.string(),
  imageUrlExpiresAt: z.iso.datetime(),
  /** 주운 건물. 보관처에 맡겼고 모르면 null */
  building: BuildingSummary.nullable(),
  /** 습득 층. 모르면 null */
  floor: z.number().int().nullable(),
  /** 습득자가 적은 자세한 위치. 없으면 null */
  locationDetail: z.string().nullable(),
  storageType: StorageType,
  storagePlace: StoragePlaceSummary.nullable(),
  status: FoundStatus,
  foundAt: z.iso.datetime(),
  isSeed: z.boolean(),
  /** 고가품이면 보관처 대면 수령 안내 (QA W3). 아니면 null */
  pickupNotice: z.string().nullable(),
});
export type FoundItemDetailResponse = z.infer<typeof FoundItemDetailResponse>;
