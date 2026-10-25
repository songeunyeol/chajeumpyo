import { CATEGORY_LABELS, type LostReportListResponse } from "@chajeumpyo/shared";
import { ChevronRight, CircleDot, Layers, PackageCheck, Plus, Search, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { BellButton } from "@/components/bell-button";
import { BandHeader, Screen } from "@/components/layout/screen";
import { QueryErrorView } from "@/components/status-view";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Alert, ResultIcon, StatusBadge } from "@/components/ui/status";
import { useLostReports } from "@/data";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { errorMessageOf } from "@/lib/errors";
import { formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Report = LostReportListResponse["reports"][number];

/** L-03 홈: 내 신고(진행 중 / 닫힘), [분실 신고하기], 하단 탭 */
export function HomePage() {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useLostReports();
  const reports = data?.reports ?? [];
  const open = reports.filter((r) => r.status === "OPEN");
  const closed = reports.filter((r) => r.status !== "OPEN");

  return (
    <Screen
      flow="lost"
      tabs
      header={
        <BandHeader
          variant="lost"
          title={<span className="text-[17px] font-bold text-brand">찾음표</span>}
          right={<BellButton />}
        />
      }
      footer={
        <Button onClick={() => navigate("/reports/new")}>
          <Plus aria-hidden /> 분실 신고하기
        </Button>
      }
    >
      <h2 className="m-0 text-title font-bold tracking-tight-ko">내 분실 신고</h2>
      {isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="불러오는 중">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 rounded-lg bg-white p-4 shadow-card">
              <Skeleton className="size-10 rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-5 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <QueryErrorView
          error={error}
          onRetry={() => refetch()}
          fallback={
            <Alert role="alert" tone="fail" title="신고 목록을 불러오지 못했어요">
              {errorMessageOf(error)}{" "}
              <button type="button" onClick={() => refetch()} className="font-semibold text-brand underline">
                다시 불러오기
              </button>
            </Alert>
          }
        />
      ) : reports.length === 0 ? (
        <EmptyState icon={<ResultIcon tone="info" icon={Search} size={64} />} title="아직 신고한 물건이 없어요">
          잃어버린 물건을 알려 주시면
          <br />
          비슷한 습득물을 찾아 드려요.
        </EmptyState>
      ) : (
        <>
          {open.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="open-h">
              <SectionLabel id="open-h">진행 중 {open.length}</SectionLabel>
              {open.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))}
            </section>
          )}
          {closed.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="closed-h">
              <SectionLabel id="closed-h">닫힘 {closed.length}</SectionLabel>
              {closed.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))}
            </section>
          )}
        </>
      )}
    </Screen>
  );
}

function ReportCard({ report: r }: { report: Report }) {
  const Icon = CATEGORY_ICONS[r.category];
  const isOpen = r.status === "OPEN";
  return (
    <Link
      to={`/reports/${r.id}`}
      className={cn(
        "flex gap-3 rounded-lg p-4 shadow-card",
        isOpen ? "bg-white" : "bg-[#FAF8F4] shadow-[0_0_0_1px_var(--border)]",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          isOpen ? "bg-brand-soft text-brand" : "bg-surface-sunken text-ink-muted",
        )}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <b className="text-[16px] font-bold">{CATEGORY_LABELS[r.category]}</b>
        <span className="text-small text-ink-muted">
          {formatRange(r.lostFrom, r.lostTo)} · {r.building?.name ?? "위치 모름"}
        </span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          {r.status === "OPEN" && (
            <StatusBadge tone="pass" icon={CircleDot}>
              진행 중
            </StatusBadge>
          )}
          {r.status === "RESOLVED" && (
            <StatusBadge tone="neutral" icon={PackageCheck}>
              찾음
            </StatusBadge>
          )}
          {r.status === "CLOSED" && (
            <StatusBadge tone="neutral" icon={X}>
              닫음
            </StatusBadge>
          )}
          {isOpen && (
            <StatusBadge tone="neutral" icon={Layers}>
              후보 {r.candidateCount}개
            </StatusBadge>
          )}
        </span>
      </span>
      <ChevronRight className="mt-1 size-5 shrink-0 text-ink" aria-hidden />
    </Link>
  );
}
