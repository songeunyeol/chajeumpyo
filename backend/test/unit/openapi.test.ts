import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi/document";

// 10/31 API 퍼징: 서버가 실제로 돌려주는 상태 코드 41건이 문서에 없었다
type Op = {
  security?: unknown[];
  parameters?: unknown[];
  requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, Record<string, unknown>> } }> };
  responses: Record<string, unknown>;
};

const doc = buildOpenApiDocument();
const ops = Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
  Object.entries(item as Record<string, Op>).map(([method, op]) => ({ path, method, op })),
);

describe("OpenAPI 문서가 실제 응답을 모두 적는다", () => {
  it("로그인이 필요한 경로는 401, 관리자 경로는 403까지 적는다", () => {
    for (const { path, method, op } of ops.filter((o) => o.op.security?.length)) {
      expect(op.responses, `${method} ${path}`).toHaveProperty("401");
      if (path.startsWith("/admin/")) expect(op.responses, `${method} ${path}`).toHaveProperty("403");
    }
  });

  it("값을 받는 경로는 400, JSON 본문은 413, 모든 경로는 500을 적는다", () => {
    for (const { path, method, op } of ops) {
      if (op.parameters?.length || op.requestBody) expect(op.responses, `${method} ${path}`).toHaveProperty("400");
      if (op.requestBody?.content?.["application/json"])
        expect(op.responses, `${method} ${path}`).toHaveProperty("413");
      expect(op.responses, `${method} ${path}`).toHaveProperty("500");
    }
  });

  it("요청 제한이 걸린 경로는 429를 적는다", () => {
    const limited = [
      "post /auth/email/code",
      "post /auth/email/verify",
      "post /auth/login",
      "post /admin/auth/login",
      "post /lost-reports",
      "patch /lost-reports/{id}",
      "post /lost-reports/{id}/claims",
      "post /claims/{attemptId}/answer",
      "post /found-items/{id}/confirm",
    ];
    for (const key of limited) {
      const found = ops.find(({ path, method }) => `${method} ${path}` === key);
      expect(found?.op.responses, key).toHaveProperty("429");
    }
  });

  it("인증 경로의 email은 학교 메일 형식만 받는다고 적는다", () => {
    const login = ops.find(({ path, method }) => method === "post" && path === "/auth/login");
    const email = login?.op.requestBody?.content?.["application/json"]?.schema?.properties?.email;
    expect(email?.format).toBe("email");
    const pattern = new RegExp(String(email?.pattern));
    expect(pattern.test("student@skuniv.ac.kr")).toBe(true);
    expect(pattern.test("student@gmail.com")).toBe(false);
    expect(pattern.test("student@skuniv.ac.kr.evil.com")).toBe(false);
  });

  it("공통 에러 응답은 ErrorResponse 컴포넌트 하나를 가리킨다", () => {
    expect(doc.components?.schemas?.ErrorResponse).toBeDefined();
  });
});
