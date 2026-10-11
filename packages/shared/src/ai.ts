import { z } from "zod";
import { Category } from "./enums";

// API 명세서 4장 "AI 응답 형식 (고정 계약)".
// 모델이 바뀌어도 백엔드는 이 형식만 받는다. 서버 내부 전용이며 클라이언트로 그대로 내려보내지 않는다.

export const AiFeature = z.object({
  /** 특징 종류. 예: sticker, scratch, case, keyring, contents */
  key: z.string().min(1),
  /** 특징 내용. 예: "곰돌이 스티커" */
  value: z.string().min(1),
});
export type AiFeature = z.infer<typeof AiFeature>;

/** 습득물 사진 분석 결과 */
export const FoundItemExtraction = z.object({
  hasObject: z.boolean(),
  category: Category,
  /** 2순위 종류. 확신이 높으면 null. 후보 검색에만 쓰고 화면에 보여주지 않는다. */
  categoryAlt: Category.nullable(),
  color: z.string().nullable(),
  brand: z.string().nullable(),
  features: z.array(AiFeature),
  description: z.string(),
  isSensitive: z.boolean(),
});
export type FoundItemExtraction = z.infer<typeof FoundItemExtraction>;

/** 분실 신고 설명 분석 결과 (hasObject, isSensitive, categoryAlt 제외) */
export const LostReportExtraction = FoundItemExtraction.omit({ hasObject: true, isSensitive: true, categoryAlt: true });
export type LostReportExtraction = z.infer<typeof LostReportExtraction>;
