import { CATEGORY_LABELS, type PickupScanResponse } from "@chajeumpyo/shared";
import {
  Ban,
  CircleCheck,
  IdCard,
  Keyboard,
  PackageCheck,
  PackageX,
  ScanLine,
  SearchX,
  Timer,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AdminPage } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { KeyValue } from "@/components/ui/card";
import { ErrorText } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Alert, ResultIcon, type Tone } from "@/components/ui/status";
import { useCompletePickup, useScanPickup } from "@/data";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";
import { formatDayTime } from "@/lib/format";

/** 직접 입력한 수령 코드: 공백만 지운다(대소문자·기호는 그대로) */
export const normalizeToken = (raw: string) => raw.replace(/\s+/g, "");

const SCAN_ERRORS: Record<string, { title: string; tone: Tone; icon: typeof Timer }> = {
  QR_EXPIRED: { title: "QR이 만료됐어요", tone: "review", icon: Timer },
  ALREADY_CLAIMED: { title: "이미 수령된 물건이에요", tone: "neutral", icon: PackageX },
  FORBIDDEN: { title: "다른 보관처의 물건이에요", tone: "fail", icon: Ban },
  NOT_FOUND: { title: "없는 QR이에요", tone: "neutral", icon: SearchX },
};

/** 카메라로 QR 읽기. @zxing/browser는 이 화면에서만 불러온다 */
function Camera({ onCode, onFail }: { onCode: (t: string) => void; onFail: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef({ onCode, onFail });
  cb.current = { onCode, onFail };
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled || !video.current) return;
        const controls = await new BrowserQRCodeReader().decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current,
          (result) => {
            if (result) {
              controls.stop();
              cb.current.onCode(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        if (!cancelled) cb.current.onFail();
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden bg-[#141A17] text-white">
      <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover opacity-80" />
      <div aria-hidden className="relative size-[232px]">
        {[
          "top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
          "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
          "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
          "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
        ].map((c) => (
          <span key={c} className={`absolute size-11 border-white ${c}`} />
        ))}
        <span className="absolute top-1/2 right-3 left-3 h-0.5 bg-[#7FD1A8] shadow-[0_0_12px_#7FD1A8]" />
      </div>
      <p className="relative m-0 text-[15px]">학생 화면의 QR을 네모 안에 맞춰 주세요</p>
    </div>
  );
}

/** A-05 QR 스캔: 카메라 또는 코드 직접 입력 → 확인(물건·원본 사진·가린 이메일·만료) → 수령 완료 */
export function AdminScanPage() {
  const navigate = useNavigate();
  const scan = useScanPickup();
  const complete = useCompletePickup();
  const [manual, setManual] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [found, setFound] = useState<PickupScanResponse | null>(null);
  const [round, setRound] = useState(0);

  const submit = (raw: string) => {
    const token = normalizeToken(raw);
    if (!token) return setCodeError("코드를 넣어 주세요.");
    setCodeError(null);
    setManual(false);
    scan.mutate({ qrToken: token }, { onSuccess: setFound });
  };
  const restart = () => {
    scan.reset();
    complete.reset();
    setFound(null);
    setCode("");
    setRound((n) => n + 1);
  };
  const close = { close: "/admin" } as const;

  if (complete.isSuccess) {
    return (
      <AdminPage
        title="수령 완료"
        back={close}
        narrow
        bodyClassName="items-center justify-center text-center"
        footer={
          <>
            <Button onClick={restart}>
              <ScanLine aria-hidden /> 다음 QR 스캔
            </Button>
            <Button variant="ghost" size="md" onClick={() => navigate("/admin")}>
              홈으로
            </Button>
          </>
        }
      >
        <div role="status" className="flex flex-col items-center gap-3">
          <ResultIcon tone="pass" icon={CircleCheck} />
          <p className="m-0 text-title font-bold">수령 완료로 기록했어요</p>
          <p className="m-0 text-ink-muted">
            {found ? CATEGORY_LABELS[found.foundItem.category] : "물건"}을 넘겨 드리면 돼요.
            <br />
            학생 앱에도 수령 완료로 보여요.
          </p>
        </div>
      </AdminPage>
    );
  }

  if (scan.isError) {
    const c = errorCodeOf(scan.error);
    const e = (c && SCAN_ERRORS[c]) || { title: "확인하지 못했어요", tone: "fail" as Tone, icon: Ban };
    return (
      <AdminPage
        title="QR 스캔"
        back={close}
        narrow
        bodyClassName="items-center justify-center text-center"
        footer={
          <Button onClick={restart}>
            <ScanLine aria-hidden /> 다시 스캔
          </Button>
        }
      >
        <div role="alert" className="flex flex-col items-center gap-3" data-testid={`scan-error-${c ?? "other"}`}>
          <ResultIcon tone={e.tone} icon={e.icon} size={72} />
          <p className="m-0 text-title font-bold">{e.title}</p>
          <p className="m-0 text-ink-muted">{errorMessageOf(scan.error)}</p>
        </div>
      </AdminPage>
    );
  }

  if (found) {
    const Icon = CATEGORY_ICONS[found.foundItem.category];
    return (
      <AdminPage
        title="수령 확인"
        back={{ close: restart }}
        narrow
        footer={
          <>
            {complete.isError && (
              <Alert role="alert" tone="fail" title="기록하지 못했어요">
                {errorMessageOf(complete.error)}
              </Alert>
            )}
            <Button loading={complete.isPending} onClick={() => complete.mutate({ pickupId: found.pickupId })}>
              <PackageCheck aria-hidden /> 수령 완료
            </Button>
            <Button variant="ghost" size="md" onClick={restart}>
              취소
            </Button>
          </>
        }
      >
        <div className="relative aspect-[320/220] w-full overflow-hidden rounded-lg bg-surface-sunken">
          {found.foundItem.imageUrl ? (
            <img src={found.foundItem.imageUrl} alt="원본 사진" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-ink-muted">사진이 없어요</span>
          )}
          <span className="absolute bottom-2.5 left-2.5 rounded-sm bg-black/60 px-2 py-1 text-caption font-semibold text-white">
            원본 사진
          </span>
        </div>
        <div className="rounded-lg border border-line bg-surface-card p-4">
          <KeyValue
            items={[
              [
                "물건",
                <span key="c" className="inline-flex items-center gap-1.5">
                  <Icon className="size-[18px]" aria-hidden />
                  {CATEGORY_LABELS[found.foundItem.category]}
                </span>,
              ],
              ["주운 곳", found.foundItem.building],
              ["찾는 분", found.claimant.emailMasked],
              ["QR 만료", formatDayTime(found.expiresAt)],
            ]}
          />
        </div>
        <Alert tone="info" icon={IdCard}>
          물건이 사진과 같은지 보고 학생증을 확인한 뒤 넘겨 주세요.
        </Alert>
      </AdminPage>
    );
  }

  return (
    <>
      <AdminPage
        title="QR 스캔"
        back={close}
        narrow
        dark
        bodyClassName="p-0 gap-0"
        footer={
          <Button variant="secondary" onClick={() => setManual(true)}>
            <Keyboard aria-hidden /> 코드 직접 입력
          </Button>
        }
      >
        {scan.isPending ? (
          <div role="status" className="flex flex-1 items-center justify-center bg-[#141A17] text-white">
            QR을 확인하는 중이에요
          </div>
        ) : cameraFailed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#141A17] px-gutter text-center text-white">
            <VideoOff className="size-10" aria-hidden />
            <p className="m-0 text-body-lg font-bold">카메라를 쓸 수 없어요</p>
            <p className="m-0 text-small text-white/75">
              카메라 권한을 허용하거나, 학생 화면의 코드를 직접 넣어 주세요.
            </p>
          </div>
        ) : (
          <Camera
            key={round}
            onCode={submit}
            onFail={() => {
              setCameraFailed(true);
              setManual(true);
            }}
          />
        )}
      </AdminPage>
      <Sheet
        open={manual}
        onOpenChange={setManual}
        title="수령 코드 입력"
        description="QR이 안 읽히면 학생 화면 QR 아래의 코드를 그대로 입력해 주세요."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(code);
          }}
        >
          <Input
            aria-label="수령 코드"
            value={code}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!codeError}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
          />
          {codeError && <ErrorText>{codeError}</ErrorText>}
          <Button type="submit">확인</Button>
        </form>
      </Sheet>
    </>
  );
}
