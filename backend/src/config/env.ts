import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  /** 쉼표로 여러 개 */
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /** mock이면 Gemini를 호출하지 않고 고정 계약 형식의 가짜 응답을 쓴다 */
  AI_MODE: z.enum(["mock", "gemini"]).default("mock"),
  GEMINI_API_KEY: z.string().optional(),
  DATA_GO_KR_SERVICE_KEY: z.string().optional(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error("환경 변수 오류:", z.treeifyError(parsed.error));
  process.exit(1);
}
if (parsed.data.AI_MODE === "gemini" && !parsed.data.GEMINI_API_KEY) {
  console.error("AI_MODE=gemini이면 GEMINI_API_KEY가 필요합니다.");
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
