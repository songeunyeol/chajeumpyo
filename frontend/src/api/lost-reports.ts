import {
  CandidateListResponse,
  type CreateLostReportRequest,
  LostReportListResponse,
  LostReportWithCandidates,
  type UpdateLostReportRequest,
} from "@chajeumpyo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_TIMEOUT_MS, request } from "@/lib/http";
import { qk } from "./keys";

// L-03 홈(내 신고 목록), L-04 신고 작성, L-05 후보, L-06 설명 고치기·닫기

/** 후보 썸네일 서명 URL은 10분 뒤 만료 → 8분이 지나면 다시 받는다 */
const CANDIDATES_STALE_MS = 8 * 60_000;

export type LostReport = LostReportListResponse["reports"][number];

/** L-03 */
export function useLostReports() {
  return useQuery({
    queryKey: qk.lostReports,
    queryFn: ({ signal }) => request("/lost-reports", { auth: "member", schema: LostReportListResponse, signal }),
  });
}

/** L-05 상단 요약, L-06: 단건 API가 없어 목록에서 고른다 */
export function useLostReport(reportId: string | undefined) {
  const q = useLostReports();
  return { ...q, data: q.data?.reports.find((r) => r.id === reportId) };
}

/**
 * L-05: 최대 3개, 습득 시각 최신순(점수·순위 없음). locked/inPersonOnly/attemptsLeft로 카드 상태를 그린다.
 */
export function useCandidates(reportId: string | undefined) {
  return useQuery({
    queryKey: qk.candidates(reportId ?? ""),
    queryFn: ({ signal }) =>
      request(`/lost-reports/${reportId}/candidates`, { auth: "member", schema: CandidateListResponse, signal }),
    enabled: !!reportId,
    staleTime: CANDIDATES_STALE_MS,
    refetchInterval: CANDIDATES_STALE_MS,
  });
}

/**
 * L-04 [신고하기]. 설명을 AI가 읽으므로 실제 AI는 수 초 걸린다. AI_UNAVAILABLE이면 입력을 지우지 말고 다시 시도.
 * 응답의 후보를 L-05 캐시에 바로 넣는다.
 */
export function useCreateLostReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLostReportRequest) =>
      request("/lost-reports", {
        json: input,
        auth: "member",
        schema: LostReportWithCandidates,
        timeoutMs: AI_TIMEOUT_MS,
      }),
    onSuccess: (r) => {
      qc.setQueryData(qk.candidates(r.id), { candidates: r.candidates });
      void qc.invalidateQueries({ queryKey: qk.lostReports, exact: true });
    },
  });
}

/** L-06: 설명 고치기(후보를 다시 고름) 또는 { status: "CLOSED" } */
export function useUpdateLostReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLostReportRequest) =>
      request(`/lost-reports/${reportId}`, {
        method: "PATCH",
        json: input,
        auth: "member",
        schema: LostReportWithCandidates,
        timeoutMs: AI_TIMEOUT_MS,
      }),
    onSuccess: (r) => {
      qc.setQueryData(qk.candidates(r.id), { candidates: r.candidates });
      void qc.invalidateQueries({ queryKey: qk.lostReports, exact: true });
    },
  });
}
