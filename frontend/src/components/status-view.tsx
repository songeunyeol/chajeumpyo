import { CircleAlert, FileQuestion, LogIn, RefreshCw, Timer, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import type { Flow } from "@/components/layout/flow";
import { BandHeader, type Leading, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { ResultIcon } from "@/components/ui/status";
import { errorCodeOf, errorStatusOf } from "@/lib/errors";
import { useCountdown } from "@/lib/use-countdown";

/** C-06 상태 종류 */
export type StatusKind = "offline" | "notfound" | "ratelimit" | "server";
export const STATUS_KINDS: StatusKind[] = ["offline", "notfound", "ratelimit", "server"];

/** 요청 오류 → 상태 종류. 화면마다 따로 다루는 오류(검증·판정 등)면 null */
export function statusKindOf(err: unknown): StatusKind | null {
  const code = errorCodeOf(err) ?? (err as { code?: string } | null)?.code;
  if (code === "NETWORK_ERROR" || code === "TIMEOUT") return "offline";
  const s = errorStatusOf(err);
  if (s === 404 || code === "NOT_FOUND") return "notfound";
  if (s === 429 || code === "RATE_LIMITED") return "ratelimit";
  if (s !== null && s >= 500) return "server";
  return null;
}

/** 429의 Retry-After(초). 오류 객체에 retryAfter가 있으면 쓰고, 없으면 30초 */
export const retryAfterOf = (err: unknown) => {
  const v = (err as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof v === "number" && v > 0 ? Math.ceil(v) : 30;
};

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function RateLimitRetry({
  until,
  onRetry,
  show,
}: {
  until: number;
  onRetry?: () => void;
  show: "badge" | "button" | "both";
}) {
  const left = useCountdown(until);
  return (
    <>
      {show !== "button" && left > 0 && (
        <p className="m-0 inline-flex items-center gap-1.5 self-center rounded-sm bg-review-bg px-2.5 py-1 text-small font-semibold text-review">
          <Timer className="size-4" aria-hidden />
          <span aria-live="off">{mmss(left)} 뒤에 다시 할 수 있어요</span>
        </p>
      )}
      {show !== "badge" && onRetry && (
        <Button variant={left > 0 ? "secondary" : "primary"} disabled={left > 0} onClick={onRetry}>
          다시 시도하기
        </Button>
      )}
    </>
  );
}

/** 상태 본문(아이콘·제목·설명·버튼). 화면 안에 넣거나 StatusScreen으로 전체 화면에 */
export function StatusView({
  kind,
  onRetry,
  retryAfter = 30,
  home = "/",
  part = "all",
  until: untilProp,
}: {
  kind: StatusKind;
  onRetry?: () => void;
  retryAfter?: number;
  home?: string;
  /** all: 본문+버튼 / body: 본문만 / actions: 버튼만(전체 화면의 하단 고정 자리) */
  part?: "all" | "body" | "actions";
  /** 429 카운트다운 끝 시각(본문·버튼이 같은 시계를 쓰게) */
  until?: number;
}) {
  const [ownUntil] = useState(() => Date.now() + retryAfter * 1000);
  const until = untilProp ?? ownUntil;
  const homeLink = (
    <Button asChild variant="ghost" size="md">
      <Link to={home}>처음으로</Link>
    </Button>
  );
  const retry = onRetry && (
    <Button onClick={onRetry}>
      <RefreshCw aria-hidden /> 다시 시도하기
    </Button>
  );
  const body = {
    offline: {
      icon: <ResultIcon tone="neutral" icon={WifiOff} />,
      title: "인터넷 연결을 확인해 주세요",
      text: (
        <>
          연결되면 다시 불러올게요.
          <br />
          쓰던 내용은 그대로 있어요.
        </>
      ),
      actions: retry,
    },
    notfound: {
      icon: <ResultIcon tone="neutral" icon={FileQuestion} />,
      title: "페이지를 찾을 수 없어요",
      text: "주소가 바뀌었거나 이미 닫힌 신고일 수 있어요.",
      actions: (
        <Button asChild>
          <Link to={home}>처음으로</Link>
        </Button>
      ),
    },
    ratelimit: {
      icon: <ResultIcon tone="review" icon={Timer} />,
      title: "잠시 후 다시 시도해 주세요",
      text: "짧은 시간에 요청이 많았어요.",
      badge: <RateLimitRetry until={until} show="badge" />,
      actions: <RateLimitRetry until={until} onRetry={onRetry} show="button" />,
    },
    server: {
      icon: <ResultIcon tone="fail" icon={CircleAlert} />,
      title: "문제가 생겼어요",
      text: (
        <>
          잠시 후 다시 시도해 주세요.
          <br />
          계속되면 종합서비스센터에 알려 주세요.
        </>
      ),
      actions: (
        <>
          {retry}
          {homeLink}
        </>
      ),
    },
  }[kind] as {
    icon: React.ReactNode;
    title: string;
    text: React.ReactNode;
    actions?: React.ReactNode;
    badge?: React.ReactNode;
  };
  if (part === "actions") return body.actions ?? null;
  return (
    <div
      role={kind === "notfound" ? undefined : "alert"}
      data-testid={`status-${kind}`}
      className="flex flex-1 flex-col justify-center gap-6 py-8"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {body.icon}
        <h2 className="m-0 text-title font-bold">{body.title}</h2>
        <p className="m-0 text-ink-muted">{body.text}</p>
        {body.badge}
      </div>
      {part === "all" && body.actions && <div className="flex flex-col gap-2">{body.actions}</div>}
    </div>
  );
}

/** C-06 전체 화면 (404·요청 실패로 보여 줄 데이터가 없을 때). 버튼은 아래 고정 자리 */
export function StatusScreen({
  kind,
  flow = "lost",
  title,
  back = true,
  onRetry,
  retryAfter = 30,
  home,
}: {
  kind: StatusKind;
  flow?: Flow;
  title?: string;
  back?: Leading;
  onRetry?: () => void;
  retryAfter?: number;
  home?: string;
}) {
  const [until] = useState(() => Date.now() + retryAfter * 1000);
  const common = { kind, onRetry, retryAfter, home, until };
  return (
    <Screen
      flow={flow}
      header={<BandHeader variant={flow === "demo" ? "lost" : flow} title={title} back={back} />}
      footer={<StatusView {...common} part="actions" />}
    >
      <StatusView {...common} part="body" />
    </Screen>
  );
}

/** 요청 실패 → 상태 본문. 다루지 않는 오류면 fallback */
export function QueryErrorView({
  error,
  onRetry,
  fallback,
}: {
  error: unknown;
  onRetry?: () => void;
  fallback: React.ReactNode;
}) {
  const kind = statusKindOf(error);
  if (!kind) return <>{fallback}</>;
  return <StatusView kind={kind} onRetry={onRetry} retryAfter={retryAfterOf(error)} />;
}

/** C-06 기본 로딩 틀. 300ms 안에 끝나면 아무것도 그리지 않는다(깜빡임 방지) */
export function PageSkeleton({ delay = 300 }: { delay?: number }) {
  const [show, setShow] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div role="status" aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-4">
      {show && (
        <>
          <Skeleton className="h-6 w-2/5" />
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-card p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </>
      )}
    </div>
  );
}

/** 오프라인이 되면 아래 토스트, 다시 연결되면 닫는다. 데이터를 이미 가진 화면은 전체 화면 대신 이것만 */
export function useOfflineToast() {
  useEffect(() => {
    const id = "offline";
    const off = () =>
      toast("오프라인이에요. 연결되면 자동으로 다시 시도해요.", {
        id,
        duration: Number.POSITIVE_INFINITY,
        icon: <WifiOff className="size-4" aria-hidden />,
      });
    const on = () => toast.dismiss(id);
    if (typeof navigator !== "undefined" && navigator.onLine === false) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);
}

/** C-06 로그인 만료 시트. 체험 계정이면 [체험 다시 시작하기] */
export function SessionExpiredSheet({ open, demo, onClose }: { open: boolean; demo?: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={
        <span className="inline-flex items-center gap-3">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <LogIn className="size-7 text-brand" />
          </span>
          {demo ? "체험 시간이 끝났어요" : "다시 로그인해 주세요"}
        </span>
      }
      description={
        demo
          ? "체험 계정은 24시간 뒤 사라져요. 새 체험 계정으로 다시 해 볼 수 있어요."
          : "로그인한 지 오래돼서 안전을 위해 나갔어요. 쓰던 내용은 로그인한 뒤 이어서 할 수 있어요."
      }
    >
      <div className="flex flex-col gap-2">
        {demo ? (
          <Button onClick={() => navigate("/demo")}>체험 다시 시작하기</Button>
        ) : (
          <Button onClick={onClose}>로그인</Button>
        )}
        <Button variant="ghost" size="md" onClick={() => navigate("/")}>
          처음으로
        </Button>
      </div>
    </Sheet>
  );
}

/** main.tsx에 한 번 둔다 */
export function OfflineToast() {
  useOfflineToast();
  return null;
}
