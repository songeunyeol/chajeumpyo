import { z } from "zod";
import { StorageOrg } from "../enums";
import { BuildingSummary } from "./buildings";

/** GET /storage-places */
export const StoragePlaceListQuery = z.object({
  /** 주면 이 건물의 보관처가 앞에 온다 */
  buildingId: z.coerce.number<number>().int().positive().optional(),
});
export type StoragePlaceListQuery = z.infer<typeof StoragePlaceListQuery>;

export const StoragePlaceItem = z.object({
  id: z.number().int(),
  name: z.string(),
  building: BuildingSummary,
  org: StorageOrg,
  guideText: z.string(),
  sameBuilding: z.boolean(),
});
export type StoragePlaceItem = z.infer<typeof StoragePlaceItem>;

export const StoragePlaceListResponse = z.object({
  storagePlaces: z.array(StoragePlaceItem),
});
export type StoragePlaceListResponse = z.infer<typeof StoragePlaceListResponse>;
