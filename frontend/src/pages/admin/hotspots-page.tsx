import { CATEGORY_LABELS, HotspotQuery, type HotspotResponse } from "@chajeumpyo/shared";
import { CalendarDays, ChartColumn, Database, Sparkles } from "lucide-react";
import { useState } from "react";
import { AdminPage } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chips";
import { ErrorText } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Alert, ResultIcon } from "@/components/ui/status";
import { useHotspots } from "@/data";
import { errorMessageOf } from "@/lib/errors";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
/** 한국 시간 오늘 YYYY-MM-DD */
export const todayKst = (now = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10);
/** 최근 n일 (오늘 포함) */
export const lastDays = (n: number, now = Date.now()) => {
  const to = todayKst(now);
  return { from: addDays(to, -(n - 1)), to };
};
/** 올해면 "10월 25일", 다른 해면 "2024년 1월 1일" */
const md = (day: string) =>
  `${day.slice(0, 4) === todayKst().slice(0, 4) ? "" : `${day.slice(0, 4)}년 `}${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;

type Preset = 7 | 30 | 90 | "custom";
type Row = { label: string; count: number };

/** 건물·종류: 위 5개 + 나머지는 "그 외" */
function topRows(rows: Row[], n = 5): Row[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((a, r) => a + r.count, 0);
  return rest > 0 ? [...head, { label: "그 외", count: rest }] : head;
}

const MAX = "var(--brand)";
const REST = "#9DBCA9";

function HBars({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-4">
      <h2 className="m-0 text-body-lg font-bold">{title}</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((r, i) => (
          <li key={r.label} className="group relative grid grid-cols-[84px_1fr_32px] items-center gap-2 py-1.5">
            <span className="truncate text-small">{r.label}</span>
            <span className="h-3.5" aria-hidden>
              <span
                className="block h-full rounded-r-[4px]"
                style={{ width: `${(r.count / max) * 100}%`, background: i === 0 ? MAX : REST }}
              />
            </span>
            <b className="text-right text-[15px]">
              {r.count}
              <span className="sr-only">건</span>
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HourBars({ rows }: { rows: HotspotResponse["byHour"] }) {
  const byHour = new Map(rows.map((r) => [r.hour, r.count]));
  // 보통은 8~20시만. 그 밖 시간에도 신고가 있으면 0~23시 전부 (요약 문장이 밤 시간을 말할 수 있어서)
  const allDay = rows.some((r) => (r.hour < 8 || r.hour > 20) && r.count > 0);
  const hours = allDay ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 13 }, (_, i) => i + 8);
  const counts = hours.map((h) => byHour.get(h) ?? 0);
  const max = Math.max(1, ...counts);
  const top = counts.indexOf(Math.max(...counts));
  const [tip, setTip] = useState<number | null>(null);
  return (
    <section aria-label="시간대별" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-4">
      <h2 className="m-0 text-body-lg font-bold">
        시간대별 <span className="text-small font-normal text-ink-muted">({allDay ? "0~23시" : "8~20시"})</span>
      </h2>
      <div className="flex h-[150px] items-end gap-[2px] pt-6">
        {hours.map((h, i) => (
          <button
            key={h}
            type="button"
            aria-label={`${h}시 ${counts[i]}건`}
            onMouseEnter={() => setTip(i)}
            onMouseLeave={() => setTip(null)}
            onFocus={() => setTip(i)}
            onBlur={() => setTip(null)}
            onClick={() => setTip(tip === i ? null : i)}
            className="relative flex h-full flex-1 items-end"
          >
            <span
              className="block w-full rounded-t-[4px]"
              style={{ height: `${((counts[i] ?? 0) / max) * 100}%`, background: i === top ? MAX : REST }}
            />
            {(i === top || tip === i) && (
              <span
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 text-[13px] font-bold whitespace-nowrap",
                  tip === i && i !== top && "rounded-sm bg-band-admin px-1.5 py-0.5 text-white",
                )}
                style={{ bottom: `calc(${((counts[i] ?? 0) / max) * 100}% + 4px)` }}
              >
                {tip === i && i !== top ? `${h}시 ${counts[i]}건` : counts[i]}
              </span>
            )}
          </button>
        ))}
      </div>
      <div aria-hidden className="flex gap-[2px] text-caption text-ink-muted">
        {hours.map((h) => (
          <span key={h} className="flex flex-1 justify-center whitespace-nowrap">
            {h % (allDay ? 4 : 2) === 0 ? h : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function DataTable({ d }: { d: HotspotResponse }) {
  const groups: [string, Row[]][] = [
    ["건물별", [...d.byBuilding].sort((a, b) => b.count - a.count).map((r) => ({ label: r.building, count: r.count }))],
    ["시간대별", d.byHour.filter((r) => r.count > 0).map((r) => ({ label: `${r.hour}시`, count: r.count }))],
    [
      "종류별",
      [...d.byCategory]
        .sort((a, b) => b.count - a.count)
        .map((r) => ({ label: CATEGORY_LABELS[r.category], count: r.count })),
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups.map(([t, rows]) => (
        <table key={t} className="w-full border-collapse rounded-lg bg-surface-card text-[14px]">
          <caption className="py-2 text-left font-bold">{t}</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                항목
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                건수
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

/** A-06 분실 다발 카드: 기간(7/30/90/직접, 1년 이내), 한 줄 요약, 건물·시간·종류 막대, 표로 보기 */
export function AdminHotspotsPage() {
  const [preset, setPreset] = useState<Preset>(30);
  const [range, setRange] = useState(() => lastDays(30));
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState(range);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const q = useHotspots(range);
  const d = q.data;

  const pick = (n: 7 | 30 | 90) => {
    setPreset(n);
    setRange(lastDays(n));
  };
  const applyCustom = () => {
    const r = HotspotQuery.safeParse(draft);
    if (!draft.from || !draft.to) return setDraftError("시작과 끝 날짜를 골라 주세요.");
    if (!r.success) return setDraftError(r.error.issues[0]?.message ?? "기간을 확인해 주세요.");
    if (draft.to > todayKst()) return setDraftError("끝 날짜는 오늘까지 고를 수 있어요.");
    setDraftError(null);
    setPreset("custom");
    setRange({ from: draft.from, to: draft.to });
    setSheet(false);
  };

  return (
    <AdminPage tabs title="분실 다발 카드">
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="기간">
        {([7, 30, 90] as const).map((n) => (
          <Chip key={n} selected={preset === n} onClick={() => pick(n)}>
            {n}일
          </Chip>
        ))}
        <Chip
          selected={preset === "custom"}
          icon={CalendarDays}
          onClick={() => {
            setDraft(range);
            setSheet(true);
          }}
        >
          직접
        </Chip>
      </fieldset>
      <p className="m-0 -mt-1 text-small text-ink-muted">
        {md(range.from)} ~ {md(range.to)}
        {d ? ` · 분실 신고 ${d.total}건` : ""}
      </p>

      {q.isError && (
        <Alert role="alert" tone="fail" title="집계를 불러오지 못했어요">
          {errorMessageOf(q.error)}
        </Alert>
      )}
      {q.isPending && (
        <div role="status" aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full rounded-lg bg-band-admin/20" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      )}
      {d && d.total === 0 && (
        <EmptyState
          icon={<ResultIcon tone="neutral" icon={ChartColumn} size={64} />}
          title="이 기간에는 분실 신고가 없어요"
        >
          기간을 넓혀 보세요.
        </EmptyState>
      )}
      {d && d.total > 0 && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          <section className="flex flex-col gap-3 rounded-lg bg-band-admin p-5 text-white lg:col-span-2">
            <span className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-sm bg-white/12 px-2 py-1 text-caption font-semibold">
                <Sparkles className="size-4" aria-hidden />한 줄 요약
              </span>
              {d.isSeedData && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-seed-bg px-2 py-1 text-caption font-semibold text-seed">
                  <Database className="size-4" aria-hidden />
                  시드 집계
                </span>
              )}
            </span>
            <p className="m-0 text-[19px] leading-snug font-bold">{d.topInsight}</p>
            {d.isSeedData && (
              <p className="m-0 text-small text-white/70">시연용 데이터로 집계했어요. 실제 신고가 쌓이면 바뀌어요.</p>
            )}
          </section>
          {asTable ? (
            <div className="lg:col-span-2">
              <DataTable d={d} />
            </div>
          ) : (
            <>
              <HBars title="건물별" rows={topRows(d.byBuilding.map((r) => ({ label: r.building, count: r.count })))} />
              <HourBars rows={d.byHour} />
              <HBars
                title="종류별"
                rows={topRows(d.byCategory.map((r) => ({ label: CATEGORY_LABELS[r.category], count: r.count })))}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="inline-flex min-h-touch w-fit items-center font-semibold text-brand underline underline-offset-4"
          >
            {asTable ? "막대로 보기" : "표로 보기"}
          </button>
        </div>
      )}

      <Sheet open={sheet} onOpenChange={setSheet} title="기간 직접 고르기" description="최대 1년까지 고를 수 있어요.">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="시작 날짜"
            value={draft.from}
            max={todayKst()}
            onChange={(e) => setDraft((v) => ({ ...v, from: e.target.value }))}
            className="min-w-0 flex-1 px-3"
          />
          <span aria-hidden>~</span>
          <Input
            type="date"
            aria-label="끝 날짜"
            value={draft.to}
            max={todayKst()}
            onChange={(e) => setDraft((v) => ({ ...v, to: e.target.value }))}
            className="min-w-0 flex-1 px-3"
          />
        </div>
        {draftError && <ErrorText>{draftError}</ErrorText>}
        <Button onClick={applyCustom}>이 기간으로 보기</Button>
      </Sheet>
    </AdminPage>
  );
}
