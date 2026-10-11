import { env } from "../config/env";
import { mockAiClient } from "./mock";
import type { AiClient } from "./types";

export type { AiClient } from "./types";
export { EMBEDDING_DIM } from "./types";

function createAiClient(): AiClient {
  if (env.AI_MODE === "mock") return mockAiClient;
  // TODO(F-02): Gemini 구현. 모델 확정 후 src/ai/gemini.ts에 추가한다.
  throw new Error("AI_MODE=gemini는 아직 구현되지 않았어요. AI_MODE=mock으로 실행하세요.");
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
};
