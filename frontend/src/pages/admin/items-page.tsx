import { ADMIN_PAGE_SIZE, type AdminFoundItemSummary, CATEGORY_LABELS, FoundStatus } from "@chajeumpyo/shared";
import { ChevronLeft, ChevronRight, CircleCheck, ImageOff, Inbox, ScanLine, UserCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AdminPage } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chips";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Alert, ResultIcon, StatusBadge } from "@/components/ui/status";
import { useAdminFoundItems } from "@/data";
import { FOUND_STATUS_VIEW, STATUS_FILTERS } from "@/lib/admin-status";
import { errorMessageOf } from "@/lib/errors";
import { formatDay, formatFloor } from "@/lib/format";
import { cn } from "@/lib/utils";

const titleOf = (i: AdminFoundItemSummary) =>
  i.title ?? (i.status === "REVIEW" ? "제목 없음 (분석 실패)" : "제목 없음");
const categoryOf = (i: AdminFoundItemSummary) => (i.category ? CATEGORY_LABELS[i.category] : "종류 미정");
const whereOf = (i: AdminFoundItemSummary) => `${i.building.name}${i.floor !== null ? ` ${formatFloor(i.floor)}` : ""}`;
const storageOf = (i: AdminFoundItemSummary) =>
  i.storageType === "IN_PLACE" ? "그 자리에 둠" : (i.storagePlace?.name ?? "보관처");

/** 목록 사진: 서버가 준 listImageUrl(공개본)만. 없으면 빈 상자. 원본은 쓰지 않는다 */
export function ListThumb({ item, size = 56 }: { item: AdminFoundItemSummary; size?: number }) {
  return item.listImageUrl ? (
    <img
      src={item.listImageUrl}
      alt=""
      data-testid="list-thumb"
      className="shrink-0 rounded-md bg-surface-sunken object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      data-testid="list-thumb-empty"
      role="img"
      aria-label="사진 없음"
      className="flex shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-subtle"
      style={{ width: size, height: size }}
    >
      <ImageOff className="size-5" aria-hidden />
    </span>
  );
}

function Badges({ item }: { item: AdminFoundItemSummary }) {
  const v = FOUND_STATUS_VIEW[item.status];
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusBadge tone={v.tone} icon={v.icon}>
        {v.label}
      </StatusBadge>
      {item.claimLockedAt && (
        <StatusBadge tone="inperson" icon={UserCheck}>
          대면 확인만
        </StatusBadge>
      )}
      {item.isSeed && <StatusBadge tone="seed">시드</StatusBadge>}
    </span>
  );
}

/** A-03 습득물 목록: 상태 칩(개수), 20개씩, 행 전체가 A-04로. PC는 넓은 표 */
export function AdminItemsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const parsed = FoundStatus.safeParse(params.get("status"));
  const status = parsed.success ? parsed.data : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const list = useAdminFoundItems({ status, page });
  const d = list.data;
  const counts = d?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const pages = d ? Math.max(1, Math.ceil(d.total / (d.pageSize || ADMIN_PAGE_SIZE))) : 1;
  const go = (next: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = "status" in next ? next.status : status;
    if (s) p.set("status", s);
    if ((next.page ?? 1) > 1) p.set("page", String(next.page));
    setParams(p);
  };

  const chips = (
    <div className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      <Chip selected={!status} onClick={() => go({ status: undefined })} className="shrink-0">
        전체 <b>{all}</b>
      </Chip>
      {STATUS_FILTERS.map((s) => (
        <Chip key={s} selected={status === s} onClick={() => go({ status: s })} className="shrink-0">
          {FOUND_STATUS_VIEW[s].label} <span className="text-ink-muted">{counts[s] ?? 0}</span>
        </Chip>
      ))}
    </div>
  );

  return (
    <AdminPage
      tabs
      title="습득물"
      pcTitle={
        <>
          습득물 <span className="font-normal text-ink-muted">{d?.total ?? ""}</span>
        </>
      }
      right={
        <Link to="/admin/scan" aria-label="QR 스캔" className="inline-flex size-touch items-center justify-center">
          <ScanLine className="size-6" aria-hidden />
        </Link>
      }
      pcRight={
        <Button asChild variant="secondary" size="md" className="w-auto px-5">
          <Link to="/admin/scan">
            <ScanLine aria-hidden /> QR 스캔
          </Link>
        </Button>
      }
      bodyClassName="gap-3"
    >
      {chips}
      {list.isError && (
        <Alert role="alert" tone="fail" title="목록을 불러오지 못했어요">
          {errorMessageOf(list.error)}
        </Alert>
      )}
      {list.isPending && (
        <div role="status" aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[84px] w-full rounded-lg" />
          ))}
        </div>
      )}
      {d &&
        d.items.length === 0 &&
        (status === "REVIEW" ? (
          <EmptyState icon={<ResultIcon tone="pass" icon={CircleCheck} size={64} />} title="검토할 물건이 없어요">
            AI 분석이 실패한 물건이 생기면 여기에 모여요.
          </EmptyState>
        ) : (
          <EmptyState icon={<ResultIcon tone="neutral" icon={Inbox} size={64} />} title="이 상태의 습득물이 없어요">
            다른 상태를 골라 보세요.
          </EmptyState>
        ))}
      {d && d.items.length > 0 && (
        <>
          {/* 모바일: 줄 목록 */}
          <ul className="-mx-gutter m-0 list-none border-y border-line bg-surface-card p-0 lg:hidden">
            {d.items.map((i) => (
              <li key={i.id} className="border-b border-line last:border-b-0">
                <Link
                  to={`/admin/items/${i.id}`}
                  className={cn("flex gap-3 px-gutter py-4", i.status === "REVIEW" && "bg-review-bg/50")}
                >
                  <ListThumb item={i} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <b className="truncate text-[16px]">{titleOf(i)}</b>
                    <span className="truncate text-small text-ink-muted">
                      {categoryOf(i)} · {whereOf(i)} · {storageOf(i)}
                    </span>
                    <Badges item={i} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {/* PC: 넓은 표 */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface-card lg:block">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead className="bg-surface-sunken/60 text-[13px] text-ink-muted">
                <tr>
                  {["사진", "제목", "종류", "건물·층", "보관처", "습득일", "상태", "표시"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.items.map((i) => {
                  const v = FOUND_STATUS_VIEW[i.status];
                  return (
                    <tr
                      key={i.id}
                      onClick={() => navigate(`/admin/items/${i.id}`)}
                      className={cn(
                        "h-[60px] cursor-pointer border-t border-line hover:bg-brand-soft/40",
                        i.status === "REVIEW" && "bg-review-bg/50",
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <ListThumb item={i} size={44} />
                      </td>
                      <td className="px-3 font-bold">
                        <Link to={`/admin/items/${i.id}`} onClick={(e) => e.stopPropagation()}>
                          {titleOf(i)}
                        </Link>
                      </td>
                      <td className="px-3">{i.category ? CATEGORY_LABELS[i.category] : "미정"}</td>
                      <td className="px-3">{whereOf(i)}</td>
                      <td className="px-3">{storageOf(i)}</td>
                      <td className="px-3">{formatDay(i.foundAt)}</td>
                      <td className="px-3">
                        <StatusBadge tone={v.tone} icon={v.icon}>
                          {v.label}
                        </StatusBadge>
                      </td>
                      <td className="px-3">
                        <span className="flex gap-1.5">
                          {i.claimLockedAt && (
                            <StatusBadge tone="inperson" icon={UserCheck}>
                              대면 확인만
                            </StatusBadge>
                          )}
                          {i.isSeed && <StatusBadge tone="seed">시드</StatusBadge>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav aria-label="페이지" className="flex items-center justify-center gap-3 py-2 lg:justify-end">
            <Button
              variant="secondary"
              size="icon"
              aria-label="이전 페이지"
              disabled={page <= 1}
              onClick={() => go({ page: page - 1 })}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span className="text-small text-ink-muted">
              {page} / {pages} 페이지 · {d.total}개
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="다음 페이지"
              disabled={page >= pages}
              onClick={() => go({ page: page + 1 })}
            >
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        </>
      )}
    </AdminPage>
  );
}
