import type { FoundStatus } from "@chajeumpyo/shared";
import { ChartColumn, Database, ScanLine } from "lucide-react";
import { Link } from "react-router";
import { AdminPage } from "@/components/layout/admin-shell";
import { SectionLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status";
import { useAdminFoundItems, useHotspots, useSession } from "@/data";
import { FOUND_STATUS_VIEW } from "@/lib/admin-status";
import { cn } from "@/lib/utils";

const TILES: FoundStatus[] = ["REVIEW", "REGISTERED", "REVEALED", "CLAIMED"];

/** A-02 관리자 홈: QR 스캔 바로가기, 상태별 개수, 분실 다발 한 줄 */
export function AdminHomePage() {
  const { storagePlace } = useSession();
  const list = useAdminFoundItems({ page: 1 });
  const hot = useHotspots({});
  const counts = list.data?.counts;
  return (
    <AdminPage
      tabs
      title={
        <span className="flex items-baseline gap-2">
          찾음표 관리자
          {storagePlace && <span className="text-[13px] font-normal text-white/75">{storagePlace.name}</span>}
        </span>
      }
      pcTitle="홈"
    >
      <Link
        to="/admin/scan"
        className="flex items-center gap-4 rounded-lg bg-brand px-5 py-6 text-white shadow-card hover:bg-brand-hover"
      >
        <ScanLine className="size-10 shrink-0" aria-hidden />
        <span className="flex flex-col">
          <b className="text-[20px]">QR 스캔</b>
          <span className="text-small text-white/85">학생이 보여 준 수령 QR 읽기</span>
        </span>
      </Link>

      <section aria-labelledby="stat-title" className="flex flex-col gap-2">
        <SectionLabel id="stat-title">습득물 현황</SectionLabel>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {TILES.map((s) => {
            const v = FOUND_STATUS_VIEW[s];
            const review = s === "REVIEW" && (counts?.REVIEW ?? 0) > 0;
            return (
              <Link
                key={s}
                to={`/admin/items?status=${s}`}
                className={cn(
                  "flex min-h-[88px] flex-col items-start gap-2 rounded-lg border border-line bg-surface-card p-4",
                  review && "border-[#E3C56B] bg-review-bg",
                )}
              >
                <StatusBadge tone={v.tone} icon={v.icon}>
                  {v.label}
                </StatusBadge>
                {counts ? (
                  <b className="text-[26px] leading-none">{counts[s] ?? 0}</b>
                ) : (
                  <Skeleton className="h-7 w-10" />
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <Link to="/admin/hotspots" className="flex flex-col gap-3 rounded-lg bg-band-admin p-5 text-white">
        <span className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-sm bg-white/12 px-2 py-1 text-caption font-semibold">
            <ChartColumn className="size-4" aria-hidden />
            분실 다발
          </span>
          {hot.data?.isSeedData && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-seed-bg px-2 py-1 text-caption font-semibold text-seed">
              <Database className="size-4" aria-hidden />
              시드 집계
            </span>
          )}
        </span>
        {hot.data ? (
          <>
            <b className="text-[19px] leading-snug">
              {hot.data.total > 0 ? hot.data.topInsight : "이 기간에는 분실 신고가 없어요."}
            </b>
            <span className="text-small text-white/70">최근 30일 · {hot.data.total}건</span>
          </>
        ) : (
          <Skeleton className="h-12 w-full bg-white/10" />
        )}
      </Link>
    </AdminPage>
  );
}
