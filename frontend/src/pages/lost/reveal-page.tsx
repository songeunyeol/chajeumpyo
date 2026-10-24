import { CATEGORY_LABELS, COLOR_LABELS, type Color, type FoundItemDetailResponse } from "@chajeumpyo/shared";
import { Info, Lock, LockOpen, MapPin, PackageCheck, QrCode, Store, UserCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { KeyValue } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Alert, ResultIcon, SeedBadge, StatusBadge } from "@/components/ui/status";
import { useFoundItemDetail, useSelfPickup } from "@/data";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";
import { formatDayTime, formatFloor } from "@/lib/format";
import { cn } from "@/lib/utils";

const colorLabel = (c: string | null) => (c ? (COLOR_LABELS[c as Color] ?? c) : null);
const revealKey = (id: string) => `chajeumpyo.revealed.${id}`;

type Phase = "locked" | "opening" | "done";

/** 잠금 해제 연출: 처음 한 번만. 움직임 줄이기 설정이면 생략 */
function useRevealPhase(id: string, ready: boolean): Phase {
  const [phase, setPhase] = useState<Phase>(() => {
    try {
      if (localStorage.getItem(revealKey(id))) return "done";
    } catch {
      return "done";
    }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return "done";
    return "locked";
  });
  const startLocked = useRef(phase === "locked");
  // 준비되면 한 번만 돈다. phase를 의존성에 넣으면 "opening"으로 바뀔 때 정리 함수가 끝 타이머를 지워 멈춘다
  useEffect(() => {
    if (!ready || !startLocked.current) return;
    const t1 = setTimeout(() => setPhase("opening"), 200);
    const t2 = setTimeout(() => {
      setPhase("done");
      try {
        localStorage.setItem(revealKey(id), "1");
      } catch {
        // 무시
      }
    }, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [ready, id]);
  return phase;
}

/** L-10 사진·위치 공개: 판정을 통과한 계정만 */
export function RevealPage() {
  const { foundItemId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const floor = (location.state as { floor?: number | null } | null)?.floor;
  const detail = useFoundItemDetail(foundItemId);
  const phase = useRevealPhase(foundItemId, detail.isSuccess);
  const self = useSelfPickup(foundItemId);
  const [confirm, setConfirm] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const d = detail.data;
  const close = { close: () => navigate(-1) } as const;

  if (detail.isError) {
    const forbidden = errorCodeOf(detail.error) === "FORBIDDEN";
    return (
      <Screen
        flow="lost"
        header={<BandHeader variant="lost" back={close} title="내 물건" />}
        bodyClassName="items-center justify-center text-center"
        footer={
          <Button variant="secondary" onClick={() => navigate("/home")}>
            홈으로
          </Button>
        }
      >
        <ResultIcon tone={forbidden ? "locked" : "neutral"} icon={forbidden ? Lock : Info} />
        <p className="m-0 text-title font-bold">
          {forbidden ? "확인을 통과해야 볼 수 있어요" : "물건을 불러오지 못했어요"}
        </p>
        <p className="m-0 text-ink-muted">
          {forbidden ? "후보에서 내 물건인지 먼저 확인해 주세요." : errorMessageOf(detail.error)}
        </p>
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen flow="lost" header={<BandHeader variant="lost" back={close} title="내 물건" />}>
        <Skeleton className="aspect-[320/220] w-full rounded-lg" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </Screen>
    );
  }

  const CatIcon = CATEGORY_ICONS[d.category];
  const handedOver = d.storageType === "HANDED_OVER";
  const claimed = d.status === "CLAIMED";
  const where = `${d.building.name}${floor !== undefined && floor !== null ? ` ${formatFloor(floor)}` : ""}`;
  const shown = phase === "done";
  const footer = claimed ? undefined : handedOver ? (
    <Button
      onClick={() =>
        navigate(`/items/${foundItemId}/qr`, {
          state: { category: d.category, placeName: d.storagePlace?.name ?? null },
        })
      }
    >
      <QrCode aria-hidden /> 수령 QR 받기
    </Button>
  ) : (
    <Button onClick={() => setConfirm(true)}>
      <PackageCheck aria-hidden /> 찾았어요
    </Button>
  );

  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={close} title="내 물건" />}
      footer={shown ? footer : undefined}
    >
      <div className="relative aspect-[320/220] w-full overflow-hidden rounded-lg bg-[#CFC8BB]">
        {!imgBroken ? (
          <img
            src={d.imageUrl}
            alt={`${CATEGORY_LABELS[d.category]} 사진`}
            onError={() => setImgBroken(true)}
            className="size-full object-cover transition-[filter] duration-[600ms] ease-out"
            style={{ filter: phase === "done" ? "none" : "blur(22px)" }}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-muted">
            <span className="text-small">사진 링크가 만료됐어요.</span>
            <Button
              size="md"
              variant="secondary"
              onClick={() => {
                setImgBroken(false);
                void detail.refetch();
              }}
            >
              다시 불러오기
            </Button>
          </div>
        )}
        {phase !== "done" && (
          <div
            aria-hidden
            className={cn(
              "absolute top-1/2 left-1/2 flex size-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand shadow-[0_0_40px_rgba(255,255,255,0.8)] transition-[opacity,transform] duration-[600ms] ease-out",
              phase === "opening" && "scale-[1.4] opacity-0",
            )}
          >
            {phase === "locked" ? <Lock className="size-9" /> : <LockOpen className="size-9 -translate-y-1" />}
          </div>
        )}
        {shown && !imgBroken && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-sm bg-black/60 px-2 py-1 text-caption font-semibold text-white">
            <LockOpen className="size-3.5" aria-hidden /> 확인 통과로 열렸어요
          </span>
        )}
      </div>

      <div className={cn("reveal-rise flex flex-col gap-4", shown && "is-shown")}>
        <div className="flex items-center gap-2">
          <h2 className="m-0 flex flex-1 items-center gap-1.5 text-title font-bold">
            <CatIcon className="size-6" aria-hidden />
            {CATEGORY_LABELS[d.category]}
          </h2>
          {d.isSeed ? <SeedBadge /> : <StatusBadge tone="pass">통과</StatusBadge>}
        </div>

        {claimed && (
          <Alert tone="plain" icon={PackageCheck} title="이미 수령된 물건이에요">
            내가 가져간 게 아니라면 보관처에 문의해 주세요.
          </Alert>
        )}

        {handedOver ? (
          <>
            <div className="rounded-lg bg-white p-4 shadow-card">
              <KeyValue
                items={[
                  ...(colorLabel(d.color) ? ([["색", colorLabel(d.color)]] as [string, string][]) : []),
                  ["주운 곳", where],
                  ["습득", formatDayTime(d.foundAt)],
                ]}
              />
            </div>
            {d.storagePlace && (
              <section className="flex flex-col gap-2">
                <SectionLabel>지금 여기 있어요</SectionLabel>
                <PlaceCard icon={Store} title={d.storagePlace.name} sub={d.storagePlace.guideText} />
              </section>
            )}
            {d.pickupNotice && (
              <Alert tone="inperson" icon={UserCheck} title="직원이 한 번 더 확인해요">
                {d.pickupNotice}
              </Alert>
            )}
          </>
        ) : (
          <section className="flex flex-col gap-2">
            <SectionLabel>발견된 자리에 그대로 있어요</SectionLabel>
            <PlaceCard
              icon={MapPin}
              title={where}
              sub={`${colorLabel(d.color) ? `색: ${colorLabel(d.color)} · ` : ""}${formatDayTime(d.foundAt)} 습득`}
            />
            {d.pickupNotice && (
              <Alert tone="inperson" icon={UserCheck} title="직원이 한 번 더 확인해요">
                {d.pickupNotice}
              </Alert>
            )}
          </section>
        )}

        <p className="m-0 flex items-center gap-1 text-caption text-ink-subtle">
          <Info className="size-3.5 shrink-0" aria-hidden />
          물건을 확인한 계정은 기록되며, 수령 30일 뒤 삭제돼요.
        </p>
      </div>

      <Sheet
        open={confirm}
        onOpenChange={setConfirm}
        title="가져가셨나요?"
        description="누르면 다른 사람 후보에서 빠지고, 신고는 ‘찾음’으로 닫혀요."
      >
        {self.isError && (
          <Alert role="alert" tone="fail" title="기록하지 못했어요">
            {errorMessageOf(self.error)}
          </Alert>
        )}
        <Button
          loading={self.isPending}
          onClick={() =>
            self.mutate(undefined, {
              onSuccess: () =>
                navigate(`/items/${foundItemId}/done?kind=inplace`, {
                  replace: true,
                  state: detailState(d),
                }),
            })
          }
        >
          네, 찾았어요
        </Button>
        <Button variant="ghost" size="md" onClick={() => setConfirm(false)}>
          아직이에요
        </Button>
      </Sheet>
    </Screen>
  );
}

const detailState = (d: FoundItemDetailResponse) => ({ category: d.category, placeName: d.storagePlace?.name ?? null });

function PlaceCard({ icon: Icon, title, sub }: { icon: typeof Store; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-lg bg-white p-4 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand text-white" aria-hidden>
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <b className="text-body-lg font-bold">{title}</b>
        <span className="text-small text-ink-muted">{sub}</span>
      </span>
    </div>
  );
}
