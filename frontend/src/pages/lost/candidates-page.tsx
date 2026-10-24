import { Search } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { CandidateCard } from "@/components/candidate-card";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Alert, ResultIcon } from "@/components/ui/status";
import { useCandidates, useLostReport } from "@/data";
import { errorMessageOf } from "@/lib/errors";
import { useCenter } from "@/lib/use-center";
import { ReportSummaryCard } from "./report-summary";

/**
 * L-05 후보 목록: 최대 3개, 습득 날짜 최신순(서버 순서 그대로, 점수·순위 없음).
 * 카드에는 공개 정보만 (components/candidate-card.tsx).
 */
export function CandidatesPage() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const report = useLostReport(reportId);
  const candidates = useCandidates(reportId);
  const center = useCenter();
  const list = (candidates.data?.candidates ?? []).slice(0, 3);
  const closed = report.data && report.data.status !== "OPEN";

  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back="/home" title="후보 확인" />}
      footer={
        candidates.isSuccess && list.length === 0 ? (
          <Button variant="secondary" onClick={() => navigate("/home")}>
            홈으로
          </Button>
        ) : undefined
      }
    >
      {report.data ? (
        <ReportSummaryCard report={report.data} editable={!closed} />
      ) : (
        <Skeleton className="h-24 w-full rounded-lg" />
      )}
      {closed && (
        <Alert tone="plain" title="닫힌 신고예요">
          새 후보 알림을 받지 않고, 확인도 할 수 없어요.
        </Alert>
      )}

      {candidates.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="후보 불러오는 중">
          <Skeleton className="h-5 w-32" />
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 rounded-lg bg-white p-3.5 shadow-card">
              <Skeleton className="size-[72px] rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : candidates.isError ? (
        <Alert role="alert" tone="fail" title="후보를 불러오지 못했어요">
          {errorMessageOf(candidates.error)}
        </Alert>
      ) : list.length === 0 ? (
        <EmptyState icon={<ResultIcon tone="neutral" icon={Search} size={64} />} title="아직 비슷한 물건이 없어요">
          새 습득물이 등록되면 알림으로
          <br />
          알려 드릴게요.
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="cand-h">
          <div className="flex items-baseline justify-between">
            <h2 id="cand-h" className="m-0 text-body-lg font-bold">
              비슷한 물건 {list.length}개
            </h2>
            <span className="text-caption text-ink-subtle">습득 날짜 최신순</span>
          </div>
          {list.map((c) => (
            <CandidateCard
              key={c.foundItemId}
              candidate={c}
              centerName={center.name}
              onClaim={() =>
                navigate(`/reports/${reportId}/claim/${c.foundItemId}`, {
                  state: { floor: c.floor, category: c.category },
                })
              }
              onInPerson={() => navigate(`/reports/${reportId}/claim/${c.foundItemId}?view=inperson`)}
            />
          ))}
          <p className="m-0 text-center text-caption text-ink-subtle">사진·색·특징은 확인을 통과해야 보여요.</p>
        </section>
      )}
    </Screen>
  );
}
