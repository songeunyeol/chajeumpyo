import { CATEGORY_LABELS, Category, DESCRIPTION_MAX } from "@chajeumpyo/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { BandHeader, Screen } from "@/components/layout/screen";
import { TimedSteps, useElapsed } from "@/components/progress-steps";
import { Button } from "@/components/ui/button";
import { CheckRow } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chips";
import { ErrorText, Hint } from "@/components/ui/field";
import { Input, inputClass, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/status";
import { useBuildings, useCreateLostReport } from "@/data";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { errorMessageOf } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { type ReportFormInput, type ReportFormOutput, ReportFormSchema, toLocalInput } from "./report-form";

/** L-04 분실 신고 작성. AI 분석 중 화면, 실패(502 등)해도 입력 유지 */
export function ReportNewPage() {
  const navigate = useNavigate();
  const create = useCreateLostReport();
  const buildings = useBuildings();
  const [q, setQ] = useState("");
  const [showAllChips, setShowAllChips] = useState(true);
  const now = new Date();
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ReportFormInput, unknown, ReportFormOutput>({
    resolver: zodResolver(ReportFormSchema),
    defaultValues: {
      when: "today",
      lostFrom: toLocalInput(new Date(now.getTime() - 3 * 3_600_000)),
      lostTo: toLocalInput(now),
      unknownBuilding: false,
      description: "",
    },
  });
  const [category, when, unknownBuilding, description] = useWatch({
    control,
    name: ["category", "when", "unknownBuilding", "description"],
  });

  const onSubmit = handleSubmit((body) =>
    create.mutate(body, {
      onSuccess: (r) => navigate(`/reports/${r.id}`, { replace: true }),
      onError: () => setShowAllChips(false),
    }),
  );

  if (create.isPending) return <Analyzing />;

  const chips = Category.options.filter((c) => !q.trim() || CATEGORY_LABELS[c].includes(q.trim()));
  const failed = create.isError;

  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" back={{ close: "/home" }} title="분실 신고" />}
      footer={
        <Button type="submit" form="report-form">
          {failed ? (
            <>
              <RefreshCw aria-hidden /> 다시 시도하기
            </>
          ) : (
            "신고하고 후보 보기"
          )}
        </Button>
      }
    >
      <form id="report-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {failed && (
          <Alert role="alert" tone="fail" title="잠시 후 다시 시도해 주세요">
            {errorMessageOf(create.error, "설명을 읽지 못했어요.")} 쓴 내용은 그대로 있어요.
          </Alert>
        )}

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">무엇을 잃어버렸나요?</legend>
          {category && !showAllChips ? (
            <div className="flex items-center gap-3">
              <Chip selected icon={CATEGORY_ICONS[category]}>
                {CATEGORY_LABELS[category]}
              </Chip>
              <button
                type="button"
                onClick={() => setShowAllChips(true)}
                className="inline-flex min-h-touch items-center text-[14px] font-semibold text-brand underline underline-offset-4"
              >
                바꾸기
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted"
                  aria-hidden
                />
                <Input
                  aria-label="종류 검색"
                  placeholder="종류 검색 (예: 이어폰, 카드)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-11"
                />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="물건 종류">
                {chips.map((c) => (
                  <Chip
                    key={c}
                    icon={CATEGORY_ICONS[c]}
                    selected={category === c}
                    onClick={() => {
                      setValue("category", c, { shouldValidate: !!errors.category });
                      setQ("");
                    }}
                  >
                    {CATEGORY_LABELS[c]}
                  </Chip>
                ))}
                {chips.length === 0 && <Hint>‘{q}’ 종류가 없어요. ‘기타’를 골라 주세요.</Hint>}
              </div>
            </>
          )}
          {errors.category && <ErrorText>{errors.category.message}</ErrorText>}
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">언제 잃어버렸나요?</legend>
          <div className="flex gap-2" role="group" aria-label="시간 빠른 선택">
            {(
              [
                ["today", "오늘"],
                ["yesterday", "어제"],
                ["custom", "직접 고르기"],
              ] as const
            ).map(([v, l]) => (
              <Chip key={v} selected={when === v} onClick={() => setValue("when", v)}>
                {l}
              </Chip>
            ))}
          </div>
          {when === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                aria-label="시작 시각"
                className={cn(inputClass, "min-w-0 flex-1 px-3 text-[15px]")}
                max={toLocalInput(now)}
                {...register("lostFrom")}
              />
              <span aria-hidden className="text-ink-muted">
                ~
              </span>
              <input
                type="datetime-local"
                aria-label="끝 시각"
                aria-invalid={!!errors.lostTo}
                className={cn(inputClass, "min-w-0 flex-1 px-3 text-[15px]")}
                max={toLocalInput(now)}
                {...register("lostTo")}
              />
            </div>
          )}
          {errors.lostTo || errors.lostFrom ? (
            <ErrorText>{errors.lostTo?.message ?? errors.lostFrom?.message ?? "시간을 확인해 주세요."}</ErrorText>
          ) : (
            <Hint>정확히 몰라도 돼요. 넓게 잡을수록 후보가 많아져요.</Hint>
          )}
        </fieldset>

        {(showAllChips || !failed) && (
          <div className="flex flex-col gap-2">
            <label htmlFor="building" className="text-[15px] font-bold">
              어느 건물이었나요? <span className="font-normal text-ink-subtle">선택</span>
            </label>
            <Controller
              control={control}
              name="buildingId"
              render={({ field }) => (
                <select
                  id="building"
                  disabled={unknownBuilding}
                  className={cn(
                    inputClass,
                    "appearance-none bg-[length:20px] bg-[right_14px_center] bg-no-repeat pr-10",
                  )}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231C1F1D' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                  }}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">건물을 골라 주세요</option>
                  {(buildings.data?.buildings ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            />
            <Controller
              control={control}
              name="unknownBuilding"
              render={({ field }) => (
                <CheckRow id="unknown-building" checked={field.value} onCheckedChange={field.onChange}>
                  <span className="font-normal">잘 모르겠어요</span>
                </CheckRow>
              )}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="desc" className="text-[15px] font-bold">
            어떤 물건인가요?
          </label>
          {!failed && (
            <Alert tone="info" icon={Lock}>
              다른 사람은 모를 특징(스티커, 흠집, 안에 든 것)을 적어 주세요.{" "}
              <b className="inline">이 특징이 맞아야 물건 위치를 볼 수 있어요.</b>
            </Alert>
          )}
          <Textarea
            id="desc"
            maxLength={DESCRIPTION_MAX}
            placeholder="예: 흰색 케이스에 노란 별 스티커가 붙어 있어요."
            aria-invalid={!!errors.description}
            aria-describedby="desc-count"
            {...register("description")}
          />
          <div className="flex items-start justify-between gap-2">
            {errors.description ? <ErrorText>{errors.description.message}</ErrorText> : <span />}
            <span id="desc-count" className="shrink-0 text-caption text-ink-subtle">
              {(description ?? "").length} / {DESCRIPTION_MAX}
            </span>
          </div>
        </div>
      </form>
    </Screen>
  );
}

function Analyzing() {
  const elapsed = useElapsed();
  return (
    <Screen
      flow="lost"
      header={<BandHeader variant="lost" title="분실 신고" />}
      bodyClassName="items-center justify-center text-center gap-5"
    >
      <div className="flex size-[72px] items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden>
        <RefreshCw className="size-9 animate-spin motion-reduce:animate-none" />
      </div>
      <div role="status" className="flex flex-col gap-1">
        <p className="m-0 text-title font-bold">설명을 읽고 있어요</p>
        <p className="m-0 text-ink-muted">
          비슷한 습득물을 찾는 중이에요.
          <br />몇 초면 끝나요.
        </p>
      </div>
      <div className="w-fit">
        <TimedSteps
          steps={["신고 내용 저장", "설명에서 특징 읽기", "후보 고르기"]}
          at={[0, 800, 6000]}
          elapsed={elapsed}
        />
      </div>
    </Screen>
  );
}
