import { CATEGORY_LABELS, type Category } from "@chajeumpyo/shared";
import { ChevronDown, ChevronUp, Copy, Keyboard, PackageCheck, RefreshCw, Timer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Alert, ResultIcon, StatusBadge } from "@/components/ui/status";
import { useIssuePickupQr } from "@/data";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";
import { formatDayTime, formatRemaining } from "@/lib/format";
import { groupToken } from "@/lib/josa";
import { clearQr, loadQr, type StoredQr, saveQr } from "@/lib/pickup-store";
import { useCenter } from "@/lib/use-center";
import { useCountdown } from "@/lib/use-countdown";

/** L-11 수령 QR. 받은 QR은 기기에 두고 다시 쓴다(다시 받으면 이전 QR 만료). 체험 계정은 바로 L-12 */
export function PickupQrPage() {
  const { foundItemId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const st = (location.state as { category?: Category; placeName?: string | null } | null) ?? {};
  const center = useCenter();
  const issue = useIssuePickupQr(foundItemId);
  const [qr, setQr] = useState<StoredQr | null>(() => loadQr(foundItemId));
  const [showCode, setShowCode] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const started = useRef(false);
  const left = useCountdown(qr ? Date.parse(qr.expiresAt) : null, 30_000);
  const expired = qr !== null && left <= 0;

  const request = () =>
    issue.mutate(undefined, {
      onSuccess: (r) => {
        if (r.method === "DEMO") {
          navigate(`/items/${foundItemId}/done?kind=demo`, { replace: true, state: st });
          return;
        }
        const q = { pickupId: r.pickupId, qrToken: r.qrToken, expiresAt: r.expiresAt };
        saveQr(foundItemId, q);
        setQr(q);
        setConfirm(false);
      },
      onError: (e) => {
        if (errorCodeOf(e) === "ALREADY_CLAIMED") clearQr(foundItemId);
        setConfirm(false);
      },
    });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 한 번, 저장된 QR이 없을 때만 받는다
  useEffect(() => {
    if (started.current || qr) return;
    started.current = true;
    request();
  }, []);

  const back = `/items/${foundItemId}`;
  if (errorCodeOf(issue.error) === "ALREADY_CLAIMED") {
    return (
      <Screen
        flow="lost"
        header={<BandHeader variant="lost" back={back} title="수령 QR" />}
        bodyClassName="items-center justify-center text-center"
        footer={
          <Button variant="secondary" onClick={() => navigate("/home")}>
            홈으로
          </Button>
        }
      >
        <ResultIcon tone="neutral" icon={PackageCheck} />
        <StatusBadge tone="neutral" icon={PackageCheck}>
          수령 완료
        </StatusBadge>
        <p className="m-0 text-title font-bold">이미 수령된 물건이에요</p>
        <p className="m-0 text-ink-muted">
          내가 가져간 게 아니라면
          <br />
          {center.name}에 문의해 주세요.
        </p>
      </Screen>
    );
  }

  const CatIcon = st.category ? CATEGORY_ICONS[st.category] : null;
  const soon = left < 3_600_000;
  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={back} title="수령 QR" />}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => (qr && !expired ? setConfirm(true) : request())}
            loading={issue.isPending && !confirm}
          >
            <RefreshCw aria-hidden /> QR 다시 받기
          </Button>
          <p className="m-0 text-center text-caption text-ink-subtle">
            다시 받으면 지금 QR{showCode ? "과 코드는" : "은"} 바로 못 써요.
          </p>
        </>
      }
    >
      <p className="m-0 text-center text-[15px]">
        <b>{st.placeName ?? "보관처"}</b> 직원에게
        <br />이 화면을 보여 주세요.
      </p>
      {issue.isError && !qr && (
        <Alert role="alert" tone="fail" title="QR을 받지 못했어요">
          {errorMessageOf(issue.error)}
        </Alert>
      )}
      <section aria-label="수령 QR" className="flex flex-col items-center gap-3 rounded-lg bg-white p-5 shadow-card">
        {expired ? (
          <Alert role="alert" tone="review" icon={Timer} title="QR 유효 시간이 지났어요" className="w-full">
            QR 다시 받기를 눌러 주세요.
          </Alert>
        ) : qr ? (
          <div className="rounded-md border border-line bg-white p-3">
            <QRCodeSVG
              value={qr.qrToken}
              size={208}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#000000"
              title="수령 QR 코드"
            />
          </div>
        ) : (
          <Skeleton className="size-[232px] rounded-md" />
        )}
        {CatIcon && st.category && !showCode && (
          <p className="m-0 flex items-center gap-1.5 text-[15px] font-bold">
            <CatIcon className="size-[18px]" aria-hidden />
            {CATEGORY_LABELS[st.category]}
          </p>
        )}
        {qr && !expired && (
          <>
            <StatusBadge tone={soon ? "question" : "pass"} icon={Timer}>
              {formatRemaining(left)}
            </StatusBadge>
            {!showCode && (
              <p className="m-0 text-small text-ink-muted">{formatDayTime(qr.expiresAt)}까지 쓸 수 있어요</p>
            )}
          </>
        )}
      </section>
      {!showCode && (
        <p className="m-0 -mt-1 text-center text-caption text-ink-subtle">화면 밝기를 올리면 더 잘 읽혀요.</p>
      )}

      {qr && !expired && (
        <>
          <button
            type="button"
            aria-expanded={showCode}
            aria-controls="qr-code-panel"
            onClick={() => setShowCode((v) => !v)}
            className="mx-auto inline-flex min-h-touch items-center gap-2 px-3 text-[15px] font-semibold text-brand"
          >
            <Keyboard className="size-5" aria-hidden />
            {showCode ? "코드 접기" : "코드 보기"}
            {showCode ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          </button>
          {showCode && (
            <section
              id="qr-code-panel"
              aria-label="수령 코드"
              className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-card"
            >
              <span className="text-[13px] font-bold text-ink-muted">수령 코드</span>
              <p
                data-testid="qr-code-text"
                className="m-0 font-mono text-[20px] leading-8 font-bold tracking-wide break-words"
                translate="no"
              >
                {groupToken(qr.qrToken)}
              </p>
              <Button
                variant="secondary"
                size="md"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(qr.qrToken);
                    toast("코드를 복사했어요");
                  } catch {
                    toast("복사하지 못했어요. 코드를 직접 보여 주세요.");
                  }
                }}
              >
                <Copy aria-hidden /> 코드 복사
              </Button>
              <p className="m-0 text-small text-ink-muted">카메라가 안 될 때 직원에게 보여 주세요.</p>
            </section>
          )}
        </>
      )}

      <Sheet
        open={confirm}
        onOpenChange={setConfirm}
        title="QR을 새로 받을까요?"
        description="새 QR을 받으면 지금 QR은 바로 만료돼요. 캡처해 둔 QR도 쓸 수 없어요."
      >
        <Button loading={issue.isPending} onClick={request}>
          새로 받기
        </Button>
        <Button variant="ghost" size="md" onClick={() => setConfirm(false)}>
          취소
        </Button>
      </Sheet>
    </Screen>
  );
}
