// npm run openapi → docs/api/openapi.json 생성. 프론트 타입 생성이나 목 서버에 쓴다.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "./document";

const out = resolve(import.meta.dirname, "../../../docs/api/openapi.json");
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`OpenAPI 문서를 썼어요: ${out}`);
