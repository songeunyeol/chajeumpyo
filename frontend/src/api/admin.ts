import {
  AdminFoundItemDetailResponse,
  AdminFoundItemListResponse,
  type AdminUpdateFoundItemRequest,
  type FoundStatus,
  type HotspotQuery,
  HotspotResponse,
  InPersonPickupResponse,
  PickupCompleteResponse,
  PickupScanResponse,
} from "@chajeumpyo/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionValue } from "@/lib/auth";
import { request } from "@/lib/http";
import { qk } from "./keys";

// A-02 관리자 홈, A-03 목록, A-04 상세, A-05 QR 스캔, A-06 분실 다발 카드. 모두 관리자 세션

function useAdminEnabled() {
  return !!useSessionValue("admin");
}

/** A-02(counts), A-03: 20개씩. 페이지를 넘겨도 이전 목록을 잠깐 보여 준다 */
export function useAdminFoundItems(q: { status?: FoundStatus; page?: number } = {}) {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: qk.adminFoundItems(q),
    queryFn: ({ signal }) =>
      request("/admin/found-items", {
        auth: "admin",
        query: { status: q.status, page: q.page ?? 1 },
        schema: AdminFoundItemListResponse,
        signal,
      }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** A-04: 원본·공개본·블러 사진(서명 URL 10분), 기록 전체 */
export function useAdminFoundItem(id: string | undefined) {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: qk.adminFoundItem(id ?? ""),
    queryFn: ({ signal }) =>
      request(`/admin/found-items/${id}`, { auth: "admin", schema: AdminFoundItemDetailResponse, signal }),
    enabled: enabled && !!id,
    staleTime: 8 * 60_000,
  });
}

/** A-04 속성 저장. 검토 대기 물건은 { ..., status: "REGISTERED" }로 [저장하고 등록] */
export function useUpdateAdminFoundItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminUpdateFoundItemRequest) =>
      request(`/admin/found-items/${id}`, {
        method: "PATCH",
        json: input,
        auth: "admin",
        schema: AdminFoundItemDetailResponse,
      }),
    onSuccess: (r) => {
      qc.setQueryData(qk.adminFoundItem(id), r);
      void qc.invalidateQueries({ queryKey: qk.adminFoundItemsAll });
    },
  });
}

/** A-04 [대면 확인 후 수령 완료] + 메모(200자). NOT_IN_PERSON_ITEM이면 대면 확인 물건이 아님 */
export function useInPersonPickup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { verificationNote: string }) =>
      request(`/admin/found-items/${id}/in-person-pickup`, {
        json: input,
        auth: "admin",
        schema: InPersonPickupResponse,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.adminFoundItem(id) });
      void qc.invalidateQueries({ queryKey: qk.adminFoundItemsAll });
    },
  });
}

/** A-05 ①: QR 토큰(카메라 또는 직접 입력) → 물건·원본 사진·가린 이메일. 오류: QR_EXPIRED(410), ALREADY_CLAIMED(409), FORBIDDEN(다른 보관처) */
export function useScanPickup() {
  return useMutation({
    mutationFn: ({ qrToken }: { qrToken: string }) =>
      request("/admin/pickups/scan", { json: { qrToken: qrToken.trim() }, auth: "admin", schema: PickupScanResponse }),
  });
}

/** A-05 ② [수령 완료] */
export function useCompletePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pickupId }: { pickupId: string }) =>
      request(`/admin/pickups/${pickupId}/complete`, {
        method: "POST",
        auth: "admin",
        schema: PickupCompleteResponse,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "found-items"] });
    },
  });
}

/** A-02 요약, A-06: 한국 시간 날짜(YYYY-MM-DD), 생략하면 최근 30일. isSeedData면 "시드 집계" 배지 */
export function useHotspots(q: HotspotQuery = {}) {
  const enabled = useAdminEnabled();
  return useQuery({
    queryKey: qk.hotspots(q),
    queryFn: ({ signal }) =>
      request("/admin/stats/hotspots", { auth: "admin", query: q, schema: HotspotResponse, signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
}
