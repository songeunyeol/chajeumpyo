import {
  type AdminFoundItemDetailResponse,
  CATEGORY_LABELS,
  COLOR_LABELS,
  type Color,
  FEATURE_KEY_LABELS,
  type MatchResult,
  type PickupMethod,
  type PickupStatus,
  VERIFICATION_NOTE_MAX,
} from "@chajeumpyo/shared";
import { Clock, EyeOff, ImageOff, Info, PackageCheck, Pencil, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { AdminPage } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { KeyValue } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Alert, StatusBadge, type Tone } from "@/components/ui/status";
import { useAdminFoundItem, useInPersonPickup, useUpdateAdminFoundItem } from "@/data";
import { FOUND_STATUS_VIEW } from "@/lib/admin-status";
import { errorMessageOf } from "@/lib/errors";
import { formatDayTime, formatFloor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type AttrForm, AttributeForm, buildUpdate, formFromDetail } from "./attribute-form";

/** 수령·기한 만료로 정리된 물건(사진·특징을 지움)은 속성을 고치지 않는다 */
export const isPurged = (d: Pick<AdminFoundItemDetailResponse, "status" | "originalImageUrl" | "publicImageUrl">) =>
  d.status === "CLAIMED" || d.status === "EXPIRED" || (d.originalImageUrl === null && d.publicImageUrl === null);

/** 대면 확인 후 수령 블록: 확인 실패가 쌓여 잠긴(claimLockedAt) 물건이 아직 수령 전(등록됨·열람됨)일 때만 */
export const showInPersonBlock = (d: Pick<AdminFoundItemDetailResponse, "claimLockedAt" | "status">) =>
  !!d.claimLockedAt && (d.status === "REGISTERED" || d.status === "REVEALED");

const RESULT_VIEW: Record<MatchResult, { label: string; tone: Tone }> = {
  PASS: { label: "통과", tone: "pass" },
  BORDERLINE: { label: "질문", tone: "question" },
  FAIL: { label: "실패", tone: "fail" },
};
const METHOD_LABEL: Record<PickupMethod, string> = {
  CENTER_QR: "QR",
  SELF_REPORT: "직접",
  IN_PERSON: "대면",
  DEMO: "시연",
};
const PICKUP_STATUS: Record<PickupStatus, string> = { ISSUED: "발급", COMPLETED: "완료", EXPIRED: "만료" };
/** 좁은 표에서 이메일이 @ 앞에서만 줄바꿈되게 */
const breakAtSign = (email: string) => email.replace("@", "\u200B@");
const short = (iso: string) => formatDayTime(iso).replace(/\(.\)/, "");

function Photo({ src, label, blurred }: { src: string | null; label: string; blurred?: boolean }) {
  return (
    <figure className="m-0 flex min-w-0 flex-1 flex-col items-center gap-1.5">
      {src ? (
        <img
          src={src}
          alt={`${label} 사진`}
          data-testid={`photo-${label}`}
          className="aspect-square w-full rounded-md bg-surface-sunken object-cover"
        />
      ) : (
        <span
          role="img"
          aria-label={`${label} 사진 없음`}
          className="flex aspect-square w-full items-center justify-center rounded-md bg-surface-sunken text-ink-subtle"
        >
          <ImageOff className="size-6" aria-hidden />
        </span>
      )}
      <figcaption className="flex items-center gap-1 text-caption text-ink-muted">
        {blurred && <EyeOff className="size-3.5" aria-hidden />}
        {label}
      </figcaption>
    </figure>
  );
}

function InPersonBlock({ d }: { d: AdminFoundItemDetailResponse }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const done = useInPersonPickup(d.id);
  const submit = () => {
    const v = note.trim();
    if (!v) return setErr("확인한 내용을 적어 주세요.");
    setErr(null);
    done.mutate({ verificationNote: v }, { onSuccess: () => toast("대면 확인 후 수령 완료로 기록했어요.") });
  };
  return (
    <section
      aria-labelledby="inperson-title"
      className="flex flex-col gap-3 rounded-lg border-2 border-[#B9C1E8] bg-surface-card p-4"
    >
      <h2 id="inperson-title" className="m-0 flex items-center gap-2 text-[18px] font-bold text-inperson">
        <UserCheck className="size-6" aria-hidden />
        대면 확인 후 수령
      </h2>
      <p className="m-0 text-small text-ink-muted">
        {d.claimLockedAt ? formatDayTime(d.claimLockedAt) : ""} 확인 실패가 쌓여 온라인 확인을 막았어요. 찾으러 온 분의
        학생증과 물건 설명을 직접 확인해 주세요.
      </p>
      <label htmlFor="inperson-note" className="text-[15px] font-bold">
        신분 확인 메모
      </label>
      <Textarea
        id="inperson-note"
        value={note}
        maxLength={VERIFICATION_NOTE_MAX}
        rows={3}
        aria-invalid={!!err}
        aria-describedby="inperson-help"
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 학생증 이름·학번 뒤 4자리 확인, 물건 특징 설명 일치"
      />
      <div className="flex justify-between gap-2">
        {err ? (
          <p role="alert" className="m-0 text-small text-fail">
            {err}
          </p>
        ) : (
          <span />
        )}
        <span className="text-caption text-ink-subtle">
          {note.length} / {VERIFICATION_NOTE_MAX}
        </span>
      </div>
      <p id="inperson-help" className="m-0 flex gap-1.5 text-small text-inperson">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        신분증 번호 전체는 적지 마세요. 메모는 수령 기록과 함께 30일 뒤 지워져요.
      </p>
      {done.isError && (
        <Alert role="alert" tone="fail" title="기록하지 못했어요">
          {errorMessageOf(done.error)}
        </Alert>
      )}
      <Button loading={done.isPending} onClick={submit} className="bg-inperson hover:bg-inperson/90 active:bg-inperson">
        대면 확인 후 수령 완료
      </Button>
    </section>
  );
}

function Records({ d }: { d: AdminFoundItemDetailResponse }) {
  const th = "px-2 py-2 text-left text-[13px] font-semibold whitespace-nowrap text-ink-muted";
  const td = "px-2 py-2.5 align-top";
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="rec-attempts" className="flex flex-col gap-1">
        <SectionLabel id="rec-attempts">확인 시도</SectionLabel>
        {d.attempts.length === 0 ? (
          <p className="m-0 text-small text-ink-muted">아직 없어요.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  계정
                </th>
                <th scope="col" className={th}>
                  결과
                </th>
                <th scope="col" className={th}>
                  시각
                </th>
              </tr>
            </thead>
            <tbody>
              {d.attempts.map((a) => (
                <tr key={`${a.emailMasked}-${a.createdAt}`} className="border-b border-line">
                  <td className={td}>{breakAtSign(a.emailMasked)}</td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <span className="inline-flex flex-col items-start gap-0.5 lg:flex-row lg:items-center lg:gap-1.5">
                      <StatusBadge tone={RESULT_VIEW[a.result].tone}>{RESULT_VIEW[a.result].label}</StatusBadge>
                      {a.answerCorrect === false && <span className="text-small">오답</span>}
                      {a.answerCorrect === true && <span className="text-small">정답</span>}
                    </span>
                  </td>
                  <td className={cn(td, "text-[13px] lg:whitespace-nowrap lg:text-[14px]")}>{short(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section aria-labelledby="rec-reveals" className="flex flex-col gap-1">
        <SectionLabel id="rec-reveals">열람</SectionLabel>
        {d.reveals.length === 0 ? (
          <p className="m-0 text-small text-ink-muted">아직 없어요.</p>
        ) : (
          <ul className="m-0 list-none p-0 text-[14px]">
            {d.reveals.map((r) => (
              <li
                key={`${r.emailMasked}-${r.revealedAt}`}
                className="flex justify-between gap-2 border-b border-line px-2 py-2.5"
              >
                <span>{r.emailMasked}</span>
                <span className="whitespace-nowrap">{short(r.revealedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="rec-pickups" className="flex flex-col gap-1">
        <SectionLabel id="rec-pickups">수령</SectionLabel>
        {d.pickups.length === 0 ? (
          <p className="m-0 text-small text-ink-muted">아직 없어요.</p>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  방식
                </th>
                <th scope="col" className={th}>
                  계정 · 처리
                </th>
                <th scope="col" className={th}>
                  상태
                </th>
              </tr>
            </thead>
            <tbody>
              {d.pickups.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className={cn(td, "whitespace-nowrap")}>{METHOD_LABEL[p.method]}</td>
                  <td className={td}>
                    <div>{p.emailMasked ?? "계정 없음"}</div>
                    <div className="text-small text-ink-muted">
                      처리 {p.processedByEmailMasked ?? "없음"}
                      {p.verificationNote && ` · 메모: ${p.verificationNote}`}
                    </div>
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}>
                    <StatusBadge tone={p.status === "COMPLETED" ? "pass" : "neutral"} icon={PackageCheck}>
                      {PICKUP_STATUS[p.status]}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** A-04 습득물 상세: 사진 3종, 속성 고치기(검토 대기면 저장하고 등록), 대면 확인 수령, 기록 */
export function AdminItemDetailPage() {
  const { id = "" } = useParams();
  const q = useAdminFoundItem(id);
  const update = useUpdateAdminFoundItem(id);
  const [form, setForm] = useState<AttrForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const d = q.data;
  const review = d?.status === "REVIEW";
  const editing = !!d && (review || form !== null);
  const current = form ?? (d ? formFromDetail(d) : null);

  const save = () => {
    if (!d || !current) return;
    const r = buildUpdate(current, review);
    if (!r.ok) {
      setErrors(r.errors as Record<string, string>);
      return;
    }
    setErrors({});
    update.mutate(r.data, {
      onSuccess: () => {
        toast(review ? "저장하고 등록했어요." : "저장했어요.");
        setForm(null);
      },
    });
  };

  const back = "/admin/items";
  if (q.isError) {
    return (
      <AdminPage title="습득물 상세" back={back}>
        <Alert role="alert" tone="fail" title="불러오지 못했어요">
          {errorMessageOf(q.error)}
        </Alert>
      </AdminPage>
    );
  }
  if (!d || !current) {
    return (
      <AdminPage title="습득물 상세" back={back}>
        <div role="status" aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </AdminPage>
    );
  }

  const v = FOUND_STATUS_VIEW[d.status];
  const viewers = new Set(d.reveals.map((r) => r.emailMasked)).size;
  const where = `${d.building.name}${d.floor !== null ? ` ${formatFloor(d.floor)}` : ""}`;
  const storage = d.storageType === "IN_PLACE" ? "그 자리에 둠" : (d.storagePlace?.name ?? "보관처");
  const colorLabel = d.color ? (COLOR_LABELS[d.color as Color] ?? d.color) : null;

  return (
    <AdminPage
      title="습득물 상세"
      pcTitle={d.title ?? "습득물 상세"}
      back={back}
      footer={
        editing ? (
          <div className="flex flex-col gap-2 lg:flex-row-reverse">
            <Button loading={update.isPending} onClick={save} className="lg:w-60">
              {review ? "저장하고 등록" : "저장"}
            </Button>
            {!review && (
              <Button
                variant="ghost"
                size="md"
                className="lg:w-40"
                onClick={() => {
                  setForm(null);
                  setErrors({});
                }}
              >
                취소
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4">
          {review ? (
            <Alert tone="review" icon={Clock} title="검토 대기">
              AI 분석이 실패했어요. 속성을 채우고 등록해 주세요.
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone={v.tone} icon={v.icon}>
                {v.label}
              </StatusBadge>
              {d.claimLockedAt && (
                <StatusBadge tone="inperson" icon={UserCheck}>
                  대면 확인만
                </StatusBadge>
              )}
              {d.isSeed && <StatusBadge tone="seed">시드</StatusBadge>}
            </div>
          )}
          <div className="flex gap-2">
            <Photo src={d.originalImageUrl} label="원본" />
            <Photo src={d.publicImageUrl} label="공개본" blurred={d.isSensitive} />
            <Photo src={d.thumbnailUrl} label="후보용 흐림" />
          </div>
          <p className="m-0 text-small text-ink-muted">
            {where} · {storage} · {formatDayTime(d.foundAt)} 습득
          </p>
          {update.isError && (
            <Alert role="alert" tone="fail" title="저장하지 못했어요">
              {errorMessageOf(update.error)}
            </Alert>
          )}
          {editing ? (
            <AttributeForm value={current} onChange={setForm} errors={errors} />
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-card p-4">
              <KeyValue
                items={[
                  ["제목", d.title ?? "없음"],
                  ["종류", d.category ? CATEGORY_LABELS[d.category] : "미정"],
                  ["색·브랜드", [colorLabel, d.brand].filter(Boolean).join(" · ") || "없음"],
                  ["특징", d.features.map((f) => `${FEATURE_KEY_LABELS[f.key]}: ${f.value}`).join(", ") || "없음"],
                  ["보관", storage],
                ]}
              />
              {isPurged(d) ? (
                <p className="m-0 flex items-center gap-1.5 text-small text-ink-muted">
                  <Info className="size-4 shrink-0" aria-hidden />
                  수령·만료로 정보가 지워졌어요
                </p>
              ) : (
                <Button variant="secondary" size="md" onClick={() => setForm(formFromDetail(d))}>
                  <Pencil aria-hidden /> 속성 고치기
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {showInPersonBlock(d) && <InPersonBlock d={d} />}
          {viewers >= 2 && (
            <Alert tone="review" icon={Users} title="여러 계정이 열람했어요">
              서로 다른 {viewers}개 계정이 이 물건을 열람했어요. 수령할 때 한 번 더 확인해 주세요.
            </Alert>
          )}
          <Records d={d} />
        </div>
      </div>
    </AdminPage>
  );
}
