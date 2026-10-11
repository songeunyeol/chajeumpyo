import type { FoundItemExtraction, LostReportExtraction } from "@chajeumpyo/shared";

/** 임베딩 차원. prisma/schema.prisma의 vector(1536)과 맞춘다. 모델 확정 후 함께 바꾼다. */
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
}
