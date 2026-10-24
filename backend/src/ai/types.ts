import type {
  AiFeature,
  AnswerVerdict,
  FeatureComparison,
  FoundItemExtraction,
  LostReportExtraction,
} from "@chajeumpyo/shared";

/** 대조할 때 쓰는 속성 묶음 */
export type ComparableAttributes = { color: string | null; brand: string | null; features: AiFeature[] };

/**
 * 임베딩 차원. prisma/schema.prisma의 vector(1536)과 맞춘다.
 * Gemini 임베딩은 기본 3072차원이지만 outputDimensionality로 768·1536·3072 중 골라 받을 수 있다(MRL).
 * pgvector의 HNSW·IVFFlat 인덱스가 2000차원까지만 지원하므로 1536을 쓴다.
 */
export const EMBEDDING_DIM = 1536;

/**
 * AI 호출 경계. 서비스 코드는 이 인터페이스만 쓴다.
 * 구현은 mock(개발·테스트)과 gemini(실제) 두 가지이고 AI_MODE로 고른다.
 */
export interface AiClient {
  /** 습득물 사진 분석. 실패하면 throw하고, 호출한 쪽이 REVIEW로 저장한다. */
  extractFoundItem(image: Buffer, mimeType: string): Promise<FoundItemExtraction>;
  /** 분실 신고 설명 분석 */
  extractLostReport(description: string): Promise<LostReportExtraction>;
  /** 텍스트 임베딩. 길이는 EMBEDDING_DIM */
  embed(text: string): Promise<number[]>;
  /** 신고 속성을 습득물 비공개 속성과 하나씩 대조 (F-08). 일치·모순·확인 불가 */
  compareFeatures(reported: ComparableAttributes, stored: ComparableAttributes): Promise<FeatureComparison>;
  /** 확인 질문 답이 저장 값과 같은 뜻인지 (F-09). 실제 구현은 온도 0으로 고정 */
  judgeAnswer(input: { question: string; stored: string; answer: string }): Promise<AnswerVerdict>;
}
