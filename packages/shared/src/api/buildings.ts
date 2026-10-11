import { z } from "zod";

// 쿼리 파라미터는 문자열로 들어와 z.coerce로 숫자로 바꾼다. <number>를 붙여야 OpenAPI 문서에 필수·숫자로 표시된다.

export const BuildingSummary = z.object({
  id: z.number().int(),
  name: z.string(),
});
export type BuildingSummary = z.infer<typeof BuildingSummary>;

/** GET /buildings */
export const BuildingListResponse = z.object({
  buildings: z.array(BuildingSummary),
});
export type BuildingListResponse = z.infer<typeof BuildingListResponse>;

/** GET /buildings/nearest */
export const NearestBuildingQuery = z.object({
  lat: z.coerce.number<number>().min(-90).max(90),
  lng: z.coerce.number<number>().min(-180).max(180),
});
export type NearestBuildingQuery = z.infer<typeof NearestBuildingQuery>;

export const NearestBuildingResponse = z.object({
  /** 기준 거리보다 멀면 null. 이때 프론트는 건물 목록에서 고르게 한다. */
  building: BuildingSummary.nullable(),
  distanceM: z.number().nullable(),
});
export type NearestBuildingResponse = z.infer<typeof NearestBuildingResponse>;
