import type {
  AiFeature,
  AnswerVerdict,
  FeatureComparison,
  FoundItemExtraction,
  LostReportExtraction,
} from "@chajeumpyo/shared";

/** 대조할 때 쓰는 속성 묶음 */
export type ComparableAttributes = {
  color: string | null;
  brand: string | null;
  features: AiFeature[];
  /**
   * 습득물 쪽만: AI가 사진을 보고 쓴 물건 설명(비공개). 특징 목록에 안 들어간 부분 색·브랜드("갈색 뚜껑", "키스미")를
   * 주인이 말해도 맞힌 것으로 보기 위해 대조에 함께 쓴다 (10/31 실사용 영상: 진짜 주인이 잠겼다)
   */
  description?: string | null;
};

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
  /**
   * 신고 속성을 습득물 비공개 속성과 하나씩 대조 (F-08). 일치·모순·확인 불가.
   * callTimeoutMs: 안쪽 AI 호출(다시 보기·설명 대조·브랜드) 하나당 제한 시간. 넘으면 그 호출만 버리고 규칙 결과로 둔다
   */
  compareFeatures(
    reported: ComparableAttributes,
    stored: ComparableAttributes,
    options?: { callTimeoutMs?: number },
  ): Promise<FeatureComparison>;
  /** 확인 질문 답이 저장 값과 같은 뜻인지 (F-09). 실제 구현은 온도 0으로 고정 */
  judgeAnswer(input: { question: string; stored: string; answer: string }): Promise<AnswerVerdict>;
  /**
   * 객관식 확인 질문 보기 (F-09). correct는 저장 값을 보기 길이로 다듬은 정답, distractors는 같은 꼴의 그럴듯한 오답.
   * 오답이 모자라거나 정답과 겹치면 호출한 쪽이 미리 준비한 보기로 채운다.
   */
  quizOptions(input: {
    question: string;
    stored: string;
    /** 글자·브랜드 질문일 때 습득물 브랜드·설명(비공개). 주인이 아는 이름(제조사·한글 읽기)으로 보기를 쓰게 한다 */
    context?: string | null;
  }): Promise<{ correct: string; distractors: string[] }>;
}
