import { CATEGORY_LABELS, type RegisterFoundItemResponse } from "@chajeumpyo/shared";
import { Camera, CircleAlert, Clock, Image as ImageIcon, ImageOff, Store, Timer } from "lucide-react";
import type * as React from "react";
import { Navigate, useNavigate } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Card, KeyValue } from "@/components/ui/card";
import { Alert, ResultIcon, StatusBadge, Tag } from "@/components/ui/status";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { errorCodeOf, errorMessageOf } from "@/lib/errors";
import { formatFloor } from "@/lib/format";
import { useFinderFlow } from "./flow-context";

const place = (r: RegisterFoundItemResponse) =>
  `${r.building.name}${r.floor !== null ? ` ${formatFloor(r.floor)}` : ""}`;

/** F-04 등록 결과: 등록됨 / 귀중품 그 자리(보관처 안내) / 검토 대기 / 422 / 429 / 413 / 그 밖의 오류 */
export function FinderResultPage() {
  const navigate = useNavigate();
  const { register, resetAll, retake: clearPhoto, submitted } = useFinderFlow();

  if (!submitted) return <Navigate to="/found/new" replace />;
  if (register.isPending || register.isIdle) return <Navigate to="/found/new/uploading" replace />;

  const again = () => {
    resetAll();
    navigate("/found/new", { replace: true });
  };
  const home = () => {
    resetAll();
    navigate("/", { replace: true });
  };
  /** 입력은 두고 사진만 다시 */
  const retake = () => {
    clearPhoto();
    navigate("/found/new", { replace: true });
  };

  if (register.isError) {
    const code = errorCodeOf(register.error);
    if (code === "NO_OBJECT_DETECTED") {
      return (
        <ErrorLayout
          icon={<ResultIcon tone="neutral" icon={ImageOff} />}
          title="사진에서 물건을 찾지 못했어요"
          body={
            <>
              물건 전체가 보이게 다시 찍어 주세요.
              <br />
              입력한 건물·보관 정보는 그대로 있어요.
            </>
          }
          primary={
            <Button onClick={retake}>
              <Camera aria-hidden /> 다시 찍기
            </Button>
          }
          onHome={home}
        />
      );
    }
    if (code === "RATE_LIMITED") {
      return (
        <ErrorLayout
          icon={<ResultIcon tone="review" icon={Timer} />}
          title="잠시 후 다시 시도해 주세요"
          body={
            <>
              같은 기기에서는 10분에 5건까지
              <br />
              등록할 수 있어요.
            </>
          }
          onHome={home}
          homeAsSecondary
        />
      );
    }
    if (code === "IMAGE_TOO_LARGE") {
      return (
        <ErrorLayout
          icon={<ResultIcon tone="fail" icon={CircleAlert} />}
          title="사진 용량이 너무 커요"
          body="10MB 이하 사진으로 다시 골라 주세요."
          primary={
            <Button onClick={retake}>
              <ImageIcon aria-hidden /> 다른 사진 고르기
            </Button>
          }
          onHome={home}
        />
      );
    }
    return (
      <ErrorLayout
        icon={<ResultIcon tone="fail" icon={CircleAlert} />}
        title="등록하지 못했어요"
        body={errorMessageOf(register.error)}
        primary={<Button onClick={() => navigate("/found/new/details", { replace: true })}>다시 시도하기</Button>}
        onHome={home}
      />
    );
  }

  const r = register.data;
  if (!r) return <Navigate to="/found/new" replace />;
  const close = { close: "/" } as const;
  const storage =
    r.storageType === "HANDED_OVER" && r.storagePlace ? (
      <span className="flex flex-col">
        {r.storagePlace.name}
        <span className="font-normal text-ink-muted">{r.storagePlace.guideText}</span>
      </span>
    ) : (
      "그 자리에 둠"
    );

  // 귀중품을 그 자리에 둠 → 보관처에 맡겨 달라는 안내
  if (r.handOverAdvice) {
    const CatIcon = r.category ? CATEGORY_ICONS[r.category] : null;
    return (
      <Screen
        flow="finder"
        header={<BandHeader variant="finder" back={{ close: "/" }} title="등록 결과" />}
        footer={<Button onClick={home}>확인했어요</Button>}
      >
        <div className="flex items-center gap-3">
          <ResultIcon tone="pass" size={64} className="size-12 [&_svg]:size-7" />
          <div className="flex min-w-0 flex-col">
            <p className="m-0 text-title font-bold">등록됐어요</p>
            <p className="m-0 flex items-center gap-1 text-small text-ink-muted">
              {CatIcon && <CatIcon className="size-4" aria-hidden />}
              {r.category ? CATEGORY_LABELS[r.category] : "종류 확인 중"} · {place(r)} · 그 자리에 둠
            </p>
          </div>
        </div>
        <Alert tone="warn" title="가까운 보관처에 맡겨 주세요">
          {r.handOverAdvice.message}
        </Alert>
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-line bg-white p-0">
          {r.handOverAdvice.storagePlaces.map((p, i) => (
            <li
              key={p.id}
              className={`flex min-h-14 items-center gap-3 px-3.5 py-2 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <Store className="size-5 shrink-0 text-ink-muted" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {p.name}
                  {p.sameBuilding && <Tag>같은 건물</Tag>}
                </b>
                <small className="text-small text-ink-muted">{p.guideText}</small>
              </span>
            </li>
          ))}
        </ul>
      </Screen>
    );
  }

  const review = r.status === "REVIEW";
  const CatIcon = r.category ? CATEGORY_ICONS[r.category] : null;
  return (
    <Screen
      flow="finder"
      header={<BandHeader variant="finder" back={close} title="등록 결과" />}
      footer={
        <>
          <Button onClick={again}>
            <Camera aria-hidden /> 하나 더 등록하기
          </Button>
          <Button variant="ghost" size="md" onClick={home}>
            처음으로
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2 pt-3 text-center">
        <ResultIcon tone={review ? "review" : "pass"} icon={review ? Clock : undefined} size={64} />
        <p className="m-0 mt-2 text-title font-bold">{review ? "접수됐어요" : "등록됐어요"}</p>
        <p className="m-0 text-ink-muted">
          {review ? (
            (r.message ?? "분석이 늦어져서 관리자가 확인한 뒤 등록돼요.")
          ) : (
            <>
              잃어버린 분이 특징을 맞히면
              <br />
              보관 위치를 알려드려요.
            </>
          )}
        </p>
      </div>
      <Card variant="flat">
        <div className="flex items-center gap-2">
          {review ? (
            <StatusBadge tone="review">검토 대기</StatusBadge>
          ) : (
            <>
              <StatusBadge tone="pass">등록됨</StatusBadge>
              <span className="text-caption text-ink-subtle">AI가 알아본 종류</span>
            </>
          )}
        </div>
        <KeyValue
          items={[
            ...(r.category && !review
              ? ([
                  [
                    "종류",
                    <span key="c" className="flex items-center gap-1.5">
                      {CatIcon && <CatIcon className="size-4" aria-hidden />}
                      {CATEGORY_LABELS[r.category]}
                    </span>,
                  ],
                ] as [string, React.ReactNode][])
              : []),
            ["주운 곳", place(r)],
            ["보관", storage],
          ]}
        />
      </Card>
    </Screen>
  );
}

function ErrorLayout({
  icon,
  title,
  body,
  primary,
  onHome,
  homeAsSecondary,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  primary?: React.ReactNode;
  onHome: () => void;
  homeAsSecondary?: boolean;
}) {
  return (
    <Screen
      flow="finder"
      header={<BandHeader variant="finder" back="/found/new/details" title="등록 결과" />}
      bodyClassName="items-center justify-center text-center"
      footer={
        <>
          {primary}
          {homeAsSecondary ? (
            <Button variant="secondary" onClick={onHome}>
              처음으로
            </Button>
          ) : (
            <Button variant="ghost" size="md" onClick={onHome}>
              처음으로
            </Button>
          )}
        </>
      }
    >
      <div role="alert" className="flex flex-col items-center gap-3">
        {icon}
        <p className="m-0 mt-2 text-title font-bold">{title}</p>
        <p className="m-0 text-ink-muted">{body}</p>
      </div>
    </Screen>
  );
}
