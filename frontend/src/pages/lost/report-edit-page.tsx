import { CATEGORY_LABELS, DESCRIPTION_MAX, DESCRIPTION_MIN } from "@chajeumpyo/shared";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { KeyValue } from "@/components/ui/card";
import { ErrorText } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Alert } from "@/components/ui/status";
import { useLostReport, useUpdateLostReport } from "@/data";
import { errorMessageOf } from "@/lib/errors";
import { formatRange } from "@/lib/format";

/** L-06 신고 상세·설명 고치기·신고 닫기 */
export function ReportEditPage() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const report = useLostReport(reportId);
  const update = useUpdateLostReport(reportId);
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const r = report.data;

  useEffect(() => {
    if (r) setDesc(r.description);
  }, [r]);

  const save = () => {
    const v = desc.trim();
    if (v.length < DESCRIPTION_MIN) return setError(`설명은 ${DESCRIPTION_MIN}자 이상 적어 주세요.`);
    setError(null);
    update.mutate({ description: v }, { onSuccess: () => navigate(`/reports/${reportId}`, { replace: true }) });
  };
  const close = () => update.mutate({ status: "CLOSED" }, { onSuccess: () => navigate("/home", { replace: true }) });

  const open = r?.status === "OPEN";
  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={`/reports/${reportId}`} title="신고 상세" />}
      footer={
        open && (
          <>
            <Button
              onClick={save}
              loading={update.isPending && !confirmClose}
              disabled={!r || desc.trim() === r.description}
            >
              저장하고 후보 다시 보기
            </Button>
            <Button variant="danger-outline" onClick={() => setConfirmClose(true)}>
              신고 닫기
            </Button>
          </>
        )
      }
    >
      {!r ? (
        <Skeleton className="h-28 w-full rounded-lg" />
      ) : (
        <>
          <div className="rounded-lg bg-white p-4 shadow-card">
            <KeyValue
              items={[
                ["종류", CATEGORY_LABELS[r.category]],
                ["시간", formatRange(r.lostFrom, r.lostTo)],
                ["건물", r.building?.name ?? "모름"],
              ]}
            />
          </div>
          {update.isError && (
            <Alert role="alert" tone="fail" title="저장하지 못했어요">
              {errorMessageOf(update.error)}
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="edit-desc" className="text-[15px] font-bold">
              설명
            </label>
            <Textarea
              id="edit-desc"
              value={desc}
              maxLength={DESCRIPTION_MAX}
              readOnly={!open}
              aria-invalid={!!error}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="flex items-start justify-between gap-2">
              {error ? <ErrorText>{error}</ErrorText> : <span />}
              <span className="shrink-0 text-caption text-ink-subtle">
                {desc.length} / {DESCRIPTION_MAX}
              </span>
            </div>
          </div>
          {open ? (
            <Alert tone="info" icon={RefreshCw}>
              설명을 고치면 후보를 다시 골라요. 새 설명으로 확인하면 확인 기회를 한 번 써요.
            </Alert>
          ) : (
            <Alert tone="plain" title="닫힌 신고예요">
              닫힌 신고는 고칠 수 없어요.
            </Alert>
          )}
        </>
      )}
      <Sheet
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="신고를 닫을까요?"
        description={'닫으면 새 후보 알림을 더 받지 않아요. 닫은 신고는 홈의 "닫힘"에 남아요.'}
      >
        <Button variant="danger" onClick={close} loading={update.isPending}>
          신고 닫기
        </Button>
        <Button variant="ghost" size="md" onClick={() => setConfirmClose(false)}>
          그대로 두기
        </Button>
      </Sheet>
    </Screen>
  );
}
