import { isAbsolute } from "node:path";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  /** HS256 서명 키. 짧으면 무차별 대입에 약하므로 32자 이상 */
  JWT_SECRET: z.string().min(32, "JWT_SECRET은 32자 이상이어야 해요."),
  /** 쉼표로 여러 개 */
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /** mock이면 Gemini를 호출하지 않고 고정 계약 형식의 가짜 응답을 쓴다 */
  AI_MODE: z.enum(["mock", "gemini"]).default("mock"),
  GEMINI_API_KEY: z.string().optional(),
  /** 속성 추출 기본 모델과, 실패할 때 쓰는 대체 모델. 2.5 계열은 새 키에서 막혀(10/26 확인) 3.x를 쓴다 */
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
  GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.5-flash"),
  /** 속성 추출(사진·신고)의 생각 정도. 3.x Flash는 생각하는 모델이라 기본값으로 두면 사진 1장 중앙값 5.8초, MINIMAL은 2.6초(10/29 측정).
   * MINIMAL로 낮춰도 종류 정확도가 줄지 않아 기본값으로 둔다(docs/ai-stack.md 측정). DEFAULT면 모델 기본값을 쓴다 */
  GEMINI_THINKING_LEVEL: z.enum(["DEFAULT", "MINIMAL", "LOW", "MEDIUM", "HIGH"]).default("MINIMAL"),
  /** 임베딩 모델. 출력 차원은 src/ai/types.ts의 EMBEDDING_DIM */
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
  DATA_GO_KR_SERVICE_KEY: z.string().optional(),

  /** 가입을 허용하는 이메일 도메인. 쉼표로 여러 개. 기본값을 두지 않아 설정을 빠뜨리면 서버가 뜨지 않는다 */
  ALLOWED_EMAIL_DOMAINS: z.string().min(1),
  /** 하루에 보내는 인증 메일 전체 상한 (메일 계정 발송 한도·비용 보호) */
  MAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(300),
  /** turnstile: 등록·체험·인증 코드 요청에 Cloudflare Turnstile 캡차. off는 개발용 (production에서는 금지) */
  CAPTCHA_MODE: z.enum(["off", "turnstile"]).default("off"),
  /** 서버에서 토큰을 검증할 때만 쓰는 비밀 키. 응답·로그로 내보내지 않는다 */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  /** 위젯을 그릴 때 쓰는 공개 사이트 키. GET /api/v1/config로 프론트에 내려 준다 */
  TURNSTILE_SITE_KEY: z.string().optional(),
  /** 캡차 위젯이 그려진 프론트 페이지의 호스트(쉼표로 여러 개). 없으면 PUBLIC_BASE_URL의 호스트. 프론트와 API 주소가 다르면 꼭 넣는다 */
  TURNSTILE_HOSTNAMES: z.string().optional(),
  /** true면 production에서도 /api/docs, /api/openapi.json을 연다 */
  API_DOCS_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
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

  /** 사진 저장소. local: 서버 디스크(개발). 클라우드 저장소는 배포 결정 후 추가 */
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  /** local 저장 위치 (backend 폴더 기준) */
  STORAGE_LOCAL_DIR: z.string().default("uploads"),
  /** 서명 URL에 쓰는 이 서버의 외부 주소. 배포에서는 https://도메인 (끝에 / 없이) */
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),
  /** 습득물 보관 기한(일). 지나면 기한 만료 (초안, F-18) */
  FOUND_ITEM_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  /** AI 호출 한 번의 제한 시간 */
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  /**
   * 앞단 프록시 신뢰 설정(express trust proxy). 숫자는 홉 수, true/false, 또는 IP·서브넷 목록.
   * Railway는 프록시 한 겹이라 기본 1. 틀리면 req.ip가 프록시 IP가 돼 IP 기준 제한이 모두에게 같이 걸린다.
   */
  TRUST_PROXY: z
    .string()
    .default("1")
    .transform((v): number | boolean | string => {
      if (/^\d+$/.test(v)) return Number(v);
      if (v === "true" || v === "false") return v === "true";
      return v;
    }),
  /** production에서 백엔드가 같이 내려줄 정적 화면 폴더. 비우면 레포의 frontend/ */
  FRONTEND_DIR: z.string().optional(),
});

/** 칸끼리 맞물리는 규칙. 테스트에서 설정 규칙을 확인할 수 있게 내보낸다 */
export const EnvSchema = Env.superRefine((v, ctx) => {
  const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (v.AI_MODE === "gemini" && !v.GEMINI_API_KEY) fail("GEMINI_API_KEY", "AI_MODE=gemini이면 필요합니다.");
  if (v.CAPTCHA_MODE === "turnstile" && !v.TURNSTILE_SECRET_KEY) {
    fail("TURNSTILE_SECRET_KEY", "CAPTCHA_MODE=turnstile이면 필요합니다.");
  }
  // 사이트 키가 없으면 프론트가 위젯을 못 그려 모든 등록이 CAPTCHA_FAILED로 막힌다. 켜는 순간 같이 요구한다
  if (v.CAPTCHA_MODE === "turnstile" && !v.TURNSTILE_SITE_KEY) {
    fail("TURNSTILE_SITE_KEY", "CAPTCHA_MODE=turnstile이면 필요합니다.");
  }
  if (v.NODE_ENV === "production" && v.CAPTCHA_MODE === "off") {
    fail(
      "CAPTCHA_MODE",
      "production에서는 캡차를 끌 수 없어요. turnstile과 TURNSTILE_SECRET_KEY·TURNSTILE_SITE_KEY를 넣어 주세요.",
    );
  }
  if (v.MAIL_MODE === "smtp" && !(v.SMTP_HOST && v.SMTP_USER && v.SMTP_PASS)) {
    fail("MAIL_MODE", "MAIL_MODE=smtp이면 SMTP_HOST, SMTP_USER, SMTP_PASS가 필요합니다.");
  }
  // 배포에서 사진 서명 URL이 http로 나가거나, 업로드가 볼륨 밖(작업 폴더 기준 상대 경로)에 쌓이는 실수를 막는다
  if (v.NODE_ENV === "production" && !v.PUBLIC_BASE_URL.startsWith("https://")) {
    fail("PUBLIC_BASE_URL", "production에서는 https://로 시작해야 해요.");
  }
  if (v.NODE_ENV === "production" && !isAbsolute(v.STORAGE_LOCAL_DIR)) {
    fail("STORAGE_LOCAL_DIR", "production에서는 볼륨 아래 절대 경로(예: /data/uploads)여야 해요.");
  }
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("환경 변수 오류:", z.treeifyError(parsed.error));
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
