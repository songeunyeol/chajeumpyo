import type { FoundStatus, HotspotQuery } from "@chajeumpyo/shared";
import type { SessionScope } from "@/lib/auth";

/**
 * TanStack Query 캐시 키. 회원 데이터는 "member", 관리자 데이터는 "admin"으로 시작해
 * 로그아웃·만료 때 해당 범위만 통째로 지울 수 있게 한다 (api/provider.tsx).
 */
export const qk = {
  buildings: ["public", "buildings"] as const,
  storagePlaces: (buildingId?: number) => ["public", "storage-places", buildingId ?? null] as const,

  me: ["member", "me"] as const,
  lostReports: ["member", "lost-reports"] as const,
  candidates: (reportId: string) => ["member", "lost-reports", reportId, "candidates"] as const,
  foundItemDetail: (foundItemId: string) => ["member", "found-items", foundItemId, "detail"] as const,

  notifications: (scope: SessionScope) => [scope, "notifications"] as const,

  adminFoundItems: (q: { status?: FoundStatus; page?: number } = {}) =>
    ["admin", "found-items", "list", { status: q.status ?? null, page: q.page ?? 1 }] as const,
  adminFoundItemsAll: ["admin", "found-items", "list"] as const,
  adminFoundItem: (id: string) => ["admin", "found-items", id] as const,
  hotspots: (q: HotspotQuery = {}) => ["admin", "hotspots", { from: q.from ?? null, to: q.to ?? null }] as const,
};
