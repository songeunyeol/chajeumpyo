import { z } from "zod";
import { Category, Color, FeatureKey, MAX_FEATURES } from "./enums";

// API 명세서 4장 "AI 응답 형식 (고정 계약)".
// 모델이 바뀌어도 백엔드는 이 형식만 받는다. 서버 내부 전용이며 클라이언트로 그대로 내려보내지 않는다.

export const AiFeature = z.object({
  /** 특징 종류. 정해진 목록(FeatureKey)만 */
  key: FeatureKey,
  /** 특징 내용. 예: "곰돌이 스티커" */
  value: z.string().trim().min(1).max(40),
});
export type AiFeature = z.infer<typeof AiFeature>;

/** 사진 속 개인정보 영역. 사진 크기에 대한 비율(0~1), 왼쪽 위 기준 */
export const SensitiveRegion = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine((r) => r.x + r.width <= 1.0001 && r.y + r.height <= 1.0001, "영역이 사진 밖으로 나갔어요");
export type SensitiveRegion = z.infer<typeof SensitiveRegion>;

/** 습득물 사진 분석 결과 */
export const FoundItemExtraction = z.object({
  hasObject: z.boolean(),
  category: Category,
  /** 2순위 종류. 확신이 높으면 null. 후보 검색에만 쓰고 화면에 보여주지 않는다. */
  categoryAlt: Category.nullable(),
  /** 기본 12색 중 하나 (LOST112 색 묶음) */
  color: Color.nullable(),
  brand: z.string().trim().min(1).max(40).nullable(),
  /** 숨은 특징. 최대 MAX_FEATURES개 */
  features: z.array(AiFeature).max(MAX_FEATURES),
  description: z.string().max(500),
  /** 학생증·카드·얼굴·이름 등 개인정보가 보이면 true */
  isSensitive: z.boolean(),
  /** 개인정보가 보이는 영역. 이 부분만 가린 선명본을 만든다. 민감한데 비어 있으면 전체를 흐린다 */
  sensitiveRegions: z.array(SensitiveRegion).max(10),
  /** 관리자 목록용 짧은 제목 (비공개 정보 포함, 관리자 화면에만). 예: "흰색 무선 이어폰, 곰돌이 스티커" */
  title: z.string().trim().min(1).max(60),
});
export type FoundItemExtraction = z.infer<typeof FoundItemExtraction>;

/** 분실 신고 설명 분석 결과 (사진 전용 칸 제외) */
export const LostReportExtraction = FoundItemExtraction.omit({
  hasObject: true,
  isSensitive: true,
  categoryAlt: true,
  sensitiveRegions: true,
  title: true,
});
export type LostReportExtraction = z.infer<typeof LostReportExtraction>;

/** 특징 하나를 대조한 결과 (기능 명세서 F-08) */
export const FeatureVerdict = z.enum(["MATCH", "CONTRADICT", "UNKNOWN"]);
export type FeatureVerdict = z.infer<typeof FeatureVerdict>;

/** 신고 속성과 습득물 비공개 속성 대조 결과. 서버 내부 전용. */
export const FeatureComparison = z.object({
  /** 신고에 적힌 특징마다 하나씩 */
  features: z.array(
    z.object({
      reportedKey: z.string(),
      verdict: FeatureVerdict,
      /** 대조한 습득물 특징의 key. 확인 불가면 null */
      storedKey: z.string().nullable(),
    }),
  ),
  color: FeatureVerdict,
  brand: FeatureVerdict,
});
export type FeatureComparison = z.infer<typeof FeatureComparison>;

/** 확인 질문 답변 판정 (F-09) */
export const AnswerVerdict = z.enum(["MATCH", "NO_MATCH"]);
export type AnswerVerdict = z.infer<typeof AnswerVerdict>;
