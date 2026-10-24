import { ArrowRight, Camera, EyeOff, Image as ImageIcon, RefreshCw, ScanLine, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ConsentSheet } from "@/components/consent-sheet";
import { BandHero, Screen, StepCount } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/field";
import { Stepper } from "@/components/ui/misc";
import { ACCEPT_IMAGE, checkPhoto, type PhotoError, useFinderFlow } from "./flow-context";

const TIPS = [
  { icon: ScanLine, text: "물건 전체가 화면에 들어오게 찍어 주세요." },
  { icon: Sparkles, text: "밝은 곳에서, 배경이 단순할수록 잘 알아봐요." },
  { icon: EyeOff, text: "학생증처럼 개인정보가 보이면 공개용 사진은 흐리게 처리돼요." },
];

const PHOTO_ERRORS: Record<Exclude<PhotoError, null>, string> = {
  type: "JPG·PNG·HEIC·WEBP 사진만 올릴 수 있어요.",
  size: "사진 용량이 너무 커요. 10MB 이하 사진으로 다시 골라 주세요.",
};

export function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

/** F-01 사진 찍기: 처음이면 C-02 동의 시트 → 카메라/앨범 → 미리보기 → [다음] */
export function FinderPhotoPage() {
  const navigate = useNavigate();
  const { photo, previewUrl, setPhoto, consent, setConsent } = useFinderFlow();
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<PhotoError>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const needConsent = !consent;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = checkPhoto(file);
    setError(err);
    if (err) return;
    setPreviewBroken(false);
    setPhoto(file);
  };

  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onPick}
        data-testid="camera-input"
      />
      <input
        ref={album}
        type="file"
        accept={ACCEPT_IMAGE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onPick}
        data-testid="album-input"
      />
    </>
  );

  const stepper = <Stepper total={2} current={1} onBand />;

  if (photo) {
    return (
      <Screen
        flow="finder"
        header={
          <BandHero
            variant="finder"
            back="/"
            right={<StepCount current={1} total={2} />}
            title="이 사진으로 할까요?"
            stepper={stepper}
          >
            물건이 잘 보이면 다음으로 넘어가요.
          </BandHero>
        }
        footer={
          <>
            <Button onClick={() => navigate("/found/new/details")}>
              다음 <ArrowRight aria-hidden />
            </Button>
            <Button variant="secondary" onClick={() => camera.current?.click()}>
              <RefreshCw aria-hidden /> 다시 찍기
            </Button>
          </>
        }
      >
        {inputs}
        <div className="flex aspect-[320/260] items-center justify-center overflow-hidden rounded-lg bg-[#CFC8BB]">
          {previewUrl && !previewBroken ? (
            <img
              src={previewUrl}
              alt="고른 사진 미리보기"
              className="size-full object-cover"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-ink-muted">
              <ImageIcon className="size-8" aria-hidden />
              <span className="text-small">이 브라우저는 미리보기를 못 보여 줘요. 그대로 올려도 돼요.</span>
            </div>
          )}
        </div>
        <p className="m-0 text-center text-small text-ink-muted">
          {photo.name} · {formatBytes(photo.size)}
        </p>
        {error && <ErrorText>{PHOTO_ERRORS[error]}</ErrorText>}
      </Screen>
    );
  }

  return (
    <Screen
      flow="finder"
      header={
        <BandHero
          variant="finder"
          back="/"
          right={<StepCount current={1} total={2} />}
          title="물건을 주웠어요"
          stepper={stepper}
        >
          사진 한 장이면 끝나요. 가입하지 않아도 돼요.
        </BandHero>
      }
      footer={
        <>
          <Button onClick={() => camera.current?.click()} disabled={needConsent}>
            <Camera aria-hidden /> 카메라로 찍기
          </Button>
          <Button variant="secondary" onClick={() => album.current?.click()} disabled={needConsent}>
            <ImageIcon aria-hidden /> 앨범에서 고르기
          </Button>
          <p className="m-0 text-center text-caption text-ink-subtle">JPG·PNG·HEIC·WEBP · 10MB까지</p>
        </>
      }
    >
      {inputs}
      <button
        type="button"
        onClick={() => album.current?.click()}
        disabled={needConsent}
        className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-surface-card"
      >
        <Camera className="size-12 text-brand" strokeWidth={1.5} aria-hidden />
        <span className="text-body-lg font-bold">물건 사진을 올려 주세요</span>
        <span className="text-small text-ink-muted">한 장만 올려요</span>
      </button>
      {error && <ErrorText>{PHOTO_ERRORS[error]}</ErrorText>}
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {TIPS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2.5 text-[14px] leading-5">
            <Icon className="mt-0.5 size-[18px] shrink-0 text-brand" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      <ConsentSheet
        flow="finder"
        open={needConsent}
        onOpenChange={(open) => {
          if (!open && needConsent) navigate("/");
        }}
        onAgree={setConsent}
      />
    </Screen>
  );
}
