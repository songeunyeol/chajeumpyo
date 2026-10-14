import { z } from "zod";

// 쿼리 파라미터는 문자열로 들어와 z.coerce로 숫자로 바꾼다. <number>를 붙여야 OpenAPI 문서에 필수·숫자로 표시된다.

export const BuildingSummary = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type BuildingSummary = z.infer<typeof BuildingSummary>;

/** GET /buildings. 좌표는 건물 중심(공개 정보). 프론트가 가장 가까운 건물을 직접 고르는 데 쓴다 (shared/geo.ts) */
export const BuildingListItem = BuildingSummary.extend({
  lat: z.number(),
  lng: z.number(),
});
export type BuildingListItem = z.infer<typeof BuildingListItem>;

export const BuildingListResponse = z.object({
  buildings: z.array(BuildingListItem),
});
export type BuildingListResponse = z.infer<typeof BuildingListResponse>;
