import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { allowedEmailDomains } from "../config/env";
import "../routes"; // 라우트 파일이 registry에 경로를 등록한다
import { registry } from "./registry";

/** 생성된 문서의 컴포넌트 스키마 타입 (openapi3-ts를 직접 의존하지 않으려고 생성기 반환형에서 꺼낸다) */
type ComponentSchema = NonNullable<
  NonNullable<ReturnType<OpenApiGeneratorV31["generateDocument"]>["components"]>["schemas"]
>[string];

type Operation = {
  security?: unknown[];
  parameters?: unknown[];
  requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, Record<string, unknown>> } }> };
  responses: Record<string, unknown>;
};

/** 학교 메일만 받는 인증 경로. 서버는 소문자로 바꾼 뒤 도메인이 허용 목록과 정확히 같은지 본다 (services/auth.ts) */
const SCHOOL_EMAIL_PATHS = new Set(["/auth/email/code", "/auth/email/verify", "/auth/login", "/admin/auth/login"]);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 라우트마다 적지 않은 공통 응답을 채운다 (10/31 API 퍼징: 문서에 없는 상태 코드 41건).
 * - 로그인이 필요한 경로: 401, 관리자 경로: 403
 * - 경로·쿼리 값이나 본문을 받는 경로: 400 (UUID 형식 등 입력 검증)
 * - JSON 본문: 413 PAYLOAD_TOO_LARGE (100kb)
 * - 모든 경로: 500
 * 라우트에 이미 적은 응답은 그대로 둔다.
 */
function addCommonResponses(path: string, op: Operation) {
  const add = (status: string, description: string) => {
    op.responses[status] ??= {
      description,
      content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
    };
  };
  if (op.security?.length) add("401", "UNAUTHORIZED");
  if (op.security?.length && path.startsWith("/admin/")) add("403", "FORBIDDEN: 관리자 계정이 아님");
  if (op.parameters?.length || op.requestBody) add("400", "VALIDATION_ERROR");
  if (op.requestBody?.content?.["application/json"]) add("413", "PAYLOAD_TOO_LARGE: 본문 100kb 초과");
  add("500", "INTERNAL_ERROR");
}

/** 라우트가 errorResponse()로 적은 인라인 에러 스키마 하나를 가져온다 (ErrorResponse를 zod-to-openapi로 변환한 모양 그대로) */
function findInlineErrorSchema(paths: Record<string, unknown>) {
  for (const item of Object.values(paths)) {
    for (const op of Object.values(item as Record<string, Operation>)) {
      for (const res of Object.values(op?.responses ?? {})) {
        const schema = (res as { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> })
          .content?.["application/json"]?.schema;
        if (schema?.properties?.error) return schema as ComponentSchema;
      }
    }
  }
  throw new Error("errorResponse()로 적은 응답이 하나도 없어요");
}

/** 인증 경로의 email 칸에 학교 메일 형식을 적는다. zod의 trim·소문자 변환(pipe) 때문에 생성기가 형식을 잃는다 */
function documentSchoolEmail(path: string, op: Operation) {
  if (!SCHOOL_EMAIL_PATHS.has(path)) return;
  const email = op.requestBody?.content?.["application/json"]?.schema?.properties?.email;
  if (!email) return;
  const domains = allowedEmailDomains.map(escapeRegExp).join("|");
  email.format = "email";
  email.pattern = `^[^@\\s]+@(${domains})$`;
  email.description = `학교 메일만 받는다 (${allowedEmailDomains.join(", ")}). 앞뒤 공백은 지우고 소문자로 바꿔 비교한다`;
}

export function buildOpenApiDocument() {
  const doc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "찾음표 API",
      version: "0.1.0",
      description: "기준 문서: docs/spec/03_API명세서.md. 스키마 원본은 packages/shared.",
    },
    servers: [{ url: "/api/v1" }],
  });
  // 공통 응답이 같은 에러 스키마를 수십 번 펼치지 않게 컴포넌트로 한 번만 둔다 (라우트가 직접 적은 응답은 그대로 인라인)
  doc.components ??= {};
  doc.components.schemas ??= {};
  doc.components.schemas.ErrorResponse ??= findInlineErrorSchema(doc.paths ?? {});
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const op of Object.values(item as Record<string, Operation>)) {
      if (!op?.responses) continue;
      addCommonResponses(path, op);
      documentSchoolEmail(path, op);
    }
  }
  return doc;
}
