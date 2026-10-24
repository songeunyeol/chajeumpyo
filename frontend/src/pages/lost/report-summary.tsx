import { CATEGORY_LABELS, type LostReportListResponse } from "@chajeumpyo/shared";
import { Link } from "react-router";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { formatRange } from "@/lib/format";

type Report = LostReportListResponse["reports"][number];

/** L-05 위 신고 요약 카드 */
export function ReportSummaryCard({ report, editable = true }: { report: Report; editable?: boolean }) {
  const Icon = CATEGORY_ICONS[report.category];
  return (
    <section aria-label="내 신고" className="flex flex-col gap-1.5 rounded-lg bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex flex-1 items-center gap-1.5 text-[15px] font-bold">
          <Icon className="size-[18px]" aria-hidden />
          {CATEGORY_LABELS[report.category]}
          {report.building && ` · ${report.building.name}`}
        </h2>
        {editable && (
          <Link
            to={`/reports/${report.id}/edit`}
            className="inline-flex min-h-touch items-center text-[14px] font-semibold text-brand underline underline-offset-4"
          >
            설명 고치기
          </Link>
        )}
      </div>
      <p className="m-0 -mt-2 text-small text-ink-muted">{formatRange(report.lostFrom, report.lostTo)}</p>
      <p className="m-0 mt-2 text-[14px] leading-[22px]">“{report.description}”</p>
    </section>
  );
}
