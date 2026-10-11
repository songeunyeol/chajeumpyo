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

export const ai = createAiClient();
