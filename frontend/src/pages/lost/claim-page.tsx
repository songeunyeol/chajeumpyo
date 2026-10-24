import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ClaimResultScreen, type ClaimView } from "@/components/claim-result";
import { JudgingScreen } from "@/components/judging-screen";
import { useClaim } from "@/data";
import { REUSED_TOAST, viewFromClaim, viewFromClaimError } from "@/lib/claim-view";
import { useCenter } from "@/lib/use-center";

/** 판정 중 화면을 너무 짧게 깜빡이지 않게 */
export const MIN_JUDGING_MS = 1200;

/** L-07 판정 중 → L-08 판정 결과. ?view=inperson이면 요청 없이 대면 확인 안내만 */
export function ClaimPage() {
  const { reportId = "", foundItemId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const center = useCenter();
  const claim = useClaim(reportId);
  const inPersonOnly = params.get("view") === "inperson";
  const started = useRef(false);
  const [minDone, setMinDone] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);

  const run = () => {
    setMinDone(false);
    setTimeout(() => setMinDone(true), MIN_JUDGING_MS);
    claim.mutate(
      { foundItemId },
      {
        onSuccess: (r) => {
          setAttemptId(r.attemptId);
          if (r.result === "BORDERLINE") setQuestion(r.question);
          if (r.reused) toast(REUSED_TOAST);
        },
      },
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 화면에 들어올 때 한 번만 판정한다(개발 모드 이중 실행도 막음)
  useEffect(() => {
    if (inPersonOnly || started.current) return;
    started.current = true;
    run();
  }, []);

  const toList = () => navigate(`/reports/${reportId}`, { replace: true });

  let view: ClaimView | null = null;
  if (inPersonOnly) view = { kind: "inperson" };
  else if (minDone && claim.isSuccess) view = viewFromClaim(claim.data);
  else if (minDone && claim.isError) view = viewFromClaimError(claim.error);

  if (!view) return <JudgingScreen />;
  return (
    <ClaimResultScreen
      view={view}
      center={center}
      onClose={toList}
      onReveal={() => navigate(`/items/${foundItemId}`, { state: location.state })}
      onQuestion={() =>
        attemptId &&
        navigate(`/claims/${attemptId}/question?r=${reportId}&f=${foundItemId}`, {
          state: { question, ...((location.state as object | null) ?? {}) },
        })
      }
      onEdit={() => navigate(`/reports/${reportId}/edit`)}
      onRetry={run}
    />
  );
}
