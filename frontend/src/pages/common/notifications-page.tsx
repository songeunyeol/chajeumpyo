import type { NotificationItem, NotificationType } from "@chajeumpyo/shared";
import { Bell, Info, Lock, type LucideIcon, Package, Unlock } from "lucide-react";
import { useNavigate } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { SectionLabel } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Alert, ResultIcon } from "@/components/ui/status";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/data";
import { errorMessageOf } from "@/lib/errors";
import { formatDay, formatRelative, isTodayKst } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, [LucideIcon, string]> = {
  NEW_CANDIDATE: [Package, "bg-brand-soft text-brand"],
  MULTI_REVEAL: [Unlock, "bg-question-bg text-question"],
  CLAIM_LOCKED: [Lock, "bg-fail-bg text-fail"],
  SYSTEM: [Info, "bg-surface-sunken text-ink-muted"],
};

/** C-04 알림함: 오늘 / 지난 알림, 누르면 읽음 + 해당 신고 후보(L-05). 문구는 서버 message 그대로(공개 정보만) */
export function NotificationsPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const list = data?.notifications ?? [];
  const today = list.filter((n) => isTodayKst(n.createdAt));
  const past = list.filter((n) => !isTodayKst(n.createdAt));

  const open = (n: NotificationItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.lostReportId) navigate(`/reports/${n.lostReportId}`);
  };

  return (
    <Screen
      flow="lost"
      tabs
      bodyClassName="px-0 py-0 gap-0"
      header={
        <BandHeader
          variant="lost"
          title="알림"
          right={
            (data?.unreadCount ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="inline-flex min-h-touch items-center px-3 text-[15px] font-semibold text-brand"
              >
                모두 읽음
              </button>
            )
          }
        />
      }
    >
      {isPending ? (
        <div className="flex flex-col gap-3 p-gutter" role="status" aria-busy="true" aria-label="불러오는 중">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-gutter">
          <Alert role="alert" tone="fail" title="알림을 불러오지 못했어요">
            {errorMessageOf(error)}
          </Alert>
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<ResultIcon tone="neutral" icon={Bell} size={64} />} title="아직 알림이 없어요">
          새 후보가 생기면 여기로 알려 드려요.
        </EmptyState>
      ) : (
        <>
          {today.length > 0 && <Group title="오늘" items={today} onOpen={open} />}
          {past.length > 0 && <Group title="지난 알림" items={past} onOpen={open} />}
        </>
      )}
    </Screen>
  );
}

function Group({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
}) {
  return (
    <section>
      <SectionLabel className="px-gutter pt-5 pb-2">{title}</SectionLabel>
      <ul className="m-0 list-none border-t border-line p-0">
        {items.map((n) => {
          const [Icon, cls] = ICONS[n.type];
          const unread = !n.readAt;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpen(n)}
                className={cn(
                  "flex min-h-[72px] w-full items-start gap-3 border-b border-line px-gutter py-3.5 text-left",
                  unread ? "bg-[#FDFCF8]" : "bg-white",
                )}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", cls)} aria-hidden>
                  <Icon className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-[15px] leading-[21px]", unread ? "font-semibold" : "text-ink-muted")}>
                    {n.message}
                  </span>
                  <small className="mt-0.5 text-caption text-ink-subtle">
                    {isTodayKst(n.createdAt) ? formatRelative(n.createdAt) : formatDay(n.createdAt)}
                  </small>
                </span>
                {unread && (
                  <>
                    <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-brand" />
                    <span className="sr-only">안 읽음</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
