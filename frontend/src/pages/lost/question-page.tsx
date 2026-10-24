import { AnswerRequest } from "@chajeumpyo/shared";
import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ClaimResultScreen } from "@/components/claim-result";
import { JudgingScreen } from "@/components/judging-screen";
import { BandHeader, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Alert, StatusBadge } from "@/components/ui/status";
import { useAnswer, useClaim } from "@/data";
import { viewFromClaim, viewFromClaimError } from "@/lib/claim-view";
import { errorCodeOf } from "@/lib/errors";
import { useCenter } from "@/lib/use-center";

const ANSWER_MAX = 50;

/** L-09 확인 질문: 질문 1개, 답 1번. 보낸 뒤에는 고칠 수 없다 */
export function QuestionPage() {
  const { attemptId = "" } = useParams();
  const [params] = useSearchParams();
  const reportId = params.get("r") ?? "";
  const foundItemId = params.get("f") ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const center = useCenter();
  const state = (location.state as { question?: string } | null) ?? {};
  const answer = useAnswer(attemptId);
  const recover = useClaim(reportId);
  const [question, setQuestion] = useState<string | null>(state.question ?? null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const recovering = useRef(false);

  // 새로고침 등으로 질문을 잃었으면 같은 물건을 다시 판정해 이전 결과(질문)를 받는다. 설명이 그대로라 횟수를 쓰지 않는다
  useEffect(() => {
    if (question || recovering.current || !reportId || !foundItemId) return;
    recovering.current = true;
    recover.mutate({ foundItemId }, { onSuccess: (r) => r.result === "BORDERLINE" && setQuestion(r.question) });
  }, [question, reportId, foundItemId, recover]);

  const toList = () => navigate(reportId ? `/reports/${reportId}` : "/home", { replace: true });

  const submit = () => {
    if (sent) return;
    const parsed = AnswerRequest.safeParse({ answer: value });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "답을 확인해 주세요.");
    setError(null);
    setSent(true);
    answer.mutate(parsed.data, {
      onError: (e) => {
        if (errorCodeOf(e) === "ALREADY_ANSWERED") {
          toast("이미 답한 질문이에요.");
          toList();
        }
      },
    });
  };

  if (sent && answer.isPending) return <JudgingScreen />;
  if (sent && (answer.isSuccess || answer.isError)) {
    const view = answer.isSuccess ? viewFromClaim(answer.data) : viewFromClaimError(answer.error);
    return (
      <ClaimResultScreen
        view={view}
        center={center}
        onClose={toList}
        onReveal={() => navigate(`/items/${foundItemId}`, { state: location.state })}
        onEdit={() => navigate(`/reports/${reportId}/edit`)}
      />
    );
  }

  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={{ close: toList }} title="확인 질문" />}
      footer={
        <Button onClick={submit} disabled={!question || !value.trim() || sent}>
          답 보내기
        </Button>
      }
    >
      <section className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-card" aria-labelledby="q-text">
        <StatusBadge tone="question" icon={CircleHelp} className="w-fit">
          질문 1개
        </StatusBadge>
        {question ? (
          <h2 id="q-text" className="m-0 text-body-lg font-bold">
            {question}
          </h2>
        ) : (
          <Skeleton className="h-6 w-3/4" />
        )}
      </section>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="answer" className="text-[14px] font-semibold">
          답
        </label>
        <Input
          id="answer"
          value={value}
          maxLength={ANSWER_MAX}
          aria-invalid={!!error}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="flex items-start justify-between gap-2">
          {error ? <ErrorText>{error}</ErrorText> : <span />}
          <span className="shrink-0 text-caption text-ink-subtle">
            {value.length} / {ANSWER_MAX}
          </span>
        </div>
      </div>
      <Alert tone="warn" title="한 번만 답할 수 있어요">
        보내면 고칠 수 없어요. 틀리면 확인 기회를 한 번 써요.
      </Alert>
    </Screen>
  );
}
