import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ErrorResponse } from "@chajeumpyo/shared";

/** 라우트 파일마다 여기에 경로를 등록한다. 프론트는 /api/docs에서 확인한다. */
export const registry = new OpenAPIRegistry();

// registry.register()는 스키마에 .openapi()가 붙어 있어야 하는데, zod 4에서는 스키마를 만들기 전에
// extendZodWithOpenApi를 불러야 해서 shared 패키지가 이 라이브러리에 묶인다. 그래서 컴포넌트 등록 없이 인라인으로 쓴다.
export const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorResponse } },
});
