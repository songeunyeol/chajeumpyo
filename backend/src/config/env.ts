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

  /** 가입을 허용하는 이메일 도메인. 쉼표로 여러 개 */
  ALLOWED_EMAIL_DOMAINS: z.string().default("skuniv.ac.kr"),
  /** 로그인 토큰 유효 기간 (초안, open-issues #14) */
  ACCESS_TOKEN_TTL_HOURS: z.coerce
    .number()
    .positive()
    .default(24 * 7),
  /** 체험 계정 유효 기간. 지나면 배치로 삭제 */
  DEMO_TTL_HOURS: z.coerce.number().positive().default(24),

  /** console: 서버 로그에만 출력(개발), smtp: 실제 발송, memory: 테스트용 */
  MAIL_MODE: z.enum(["console", "smtp", "memory"]).default("console"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("찾음표 <no-reply@chajeumpyo.local>"),
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

if (parsed.data.MAIL_MODE === "smtp" && !(parsed.data.SMTP_HOST && parsed.data.SMTP_USER && parsed.data.SMTP_PASS)) {
  console.error("MAIL_MODE=smtp이면 SMTP_HOST, SMTP_USER, SMTP_PASS가 필요합니다.");
  process.exit(1);
}

export const env = parsed.data;
const splitList = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const corsOrigins = splitList(env.CORS_ORIGIN);
export const allowedEmailDomains = splitList(env.ALLOWED_EMAIL_DOMAINS).map((d) => d.toLowerCase());
