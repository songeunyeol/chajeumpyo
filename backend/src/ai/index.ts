import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { env } from "../config/env";
import { createGeminiClient } from "./gemini";
import { mockAiClient } from "./mock";
import type { AiClient } from "./types";

export type { AiClient } from "./types";
export { EMBEDDING_DIM } from "./types";

function createAiClient(): AiClient {
  if (env.AI_MODE === "mock") return mockAiClient;
  const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return createGeminiClient(genai.models, {
    model: env.GEMINI_MODEL,
    fallbackModel: env.GEMINI_FALLBACK_MODEL,
    embedModel: env.GEMINI_EMBED_MODEL,
    thinkingLevel: env.GEMINI_THINKING_LEVEL === "DEFAULT" ? undefined : (env.GEMINI_THINKING_LEVEL as ThinkingLevel),
  });
}

let current: AiClient = createAiClient();

/** 테스트에서 AI 동작(실패, 물건 없음, 민감 정보 등)을 바꿔 끼울 때 쓴다. */
export function setAiClient(client: AiClient) {
  current = client;
}

export function resetAiClient() {
  current = createAiClient();
}

/** 서비스 코드는 이 객체로 AI를 부른다. */
export const ai: AiClient = {
  extractFoundItem: (...args) => current.extractFoundItem(...args),
  extractLostReport: (...args) => current.extractLostReport(...args),
  embed: (...args) => current.embed(...args),
  compareFeatures: (...args) => current.compareFeatures(...args),
  judgeAnswer: (...args) => current.judgeAnswer(...args),
  quizOptions: (...args) => current.quizOptions(...args),
};
