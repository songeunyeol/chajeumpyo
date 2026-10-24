import {
  type AdminFoundItemDetailResponse,
  AdminUpdateFoundItemRequest,
  CATEGORY_LABELS,
  Category,
  COLOR_LABELS,
  Color,
  FEATURE_KEY_LABELS,
  FeatureKey,
  MAX_FEATURES,
} from "@chajeumpyo/shared";
import { ChevronDown, Plus, X } from "lucide-react";
import type * as React from "react";
import { ErrorText, Hint } from "@/components/ui/field";
import { Input, inputClass, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AttrForm = {
  category: Category | "";
  categoryAlt: Category | "";
  color: Color | "";
  brand: string;
  features: { key: FeatureKey; value: string }[];
  title: string;
  description: string;
};

export const formFromDetail = (d: AdminFoundItemDetailResponse): AttrForm => ({
  category: d.category ?? "",
  categoryAlt: d.categoryAlt ?? "",
  color: (Color.safeParse(d.color).data ?? "") as Color | "",
  brand: d.brand ?? "",
  features: d.features.map((f) => ({ key: f.key, value: f.value })),
  title: d.title ?? "",
  description: d.description ?? "",
});

type Errors = Partial<Record<keyof AttrForm | "form", string>>;

/**
 * 폼 → PATCH 본문. shared AdminUpdateFoundItemRequest로 검사한다.
 * 검토 대기 물건은 종류·제목·설명을 채워야 등록(status REGISTERED)할 수 있다.
 */
export function buildUpdate(
  f: AttrForm,
  register: boolean,
): { ok: true; data: AdminUpdateFoundItemRequest } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  if (register) {
    if (!f.category) errors.category = "종류를 골라 주세요.";
    if (!f.title.trim()) errors.title = "제목을 적어 주세요.";
    if (!f.description.trim()) errors.description = "설명을 적어 주세요.";
  }
  if (f.categoryAlt && f.categoryAlt === f.category) errors.categoryAlt = "1순위와 다른 종류를 골라 주세요.";
  const body = {
    category: f.category || undefined,
    categoryAlt: f.categoryAlt || null,
    color: f.color || null,
    brand: f.brand.trim() || null,
    features: f.features,
    title: f.title.trim() || undefined,
    description: f.description.trim() || undefined,
    ...(register ? { status: "REGISTERED" as const } : {}),
  };
  const parsed = AdminUpdateFoundItemRequest.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const k = (issue.path[0] as keyof AttrForm | undefined) ?? "form";
      errors[k] ??= k === "features" ? "특징은 1~40자로 적어 주세요." : issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

const COLOR_SWATCH: Record<Color, string> = {
  WHITE: "#FFFFFF",
  BLACK: "#1F1F1F",
  GRAY_SILVER: "#A3A7AB",
  RED: "#D23C32",
  ORANGE_CORAL: "#F08A4B",
  YELLOW: "#F2C94C",
  GREEN: "#3C9A5F",
  BLUE_TEAL: "#2F6FB5",
  PURPLE: "#7A55B8",
  PINK_MAGENTA: "#E07AA5",
  BROWN: "#7A5536",
  OTHER: "conic-gradient(#D23C32,#F2C94C,#3C9A5F,#2F6FB5,#7A55B8,#D23C32)",
};

function Select({
  id,
  value,
  onChange,
  children,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "w-full appearance-none pr-10")}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2" aria-hidden />
    </div>
  );
}

function Label({ htmlFor, children, sub }: { htmlFor?: string; children: React.ReactNode; sub?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[15px] font-bold">
      {children} {sub && <span className="font-normal text-ink-muted">{sub}</span>}
    </label>
  );
}

/** A-04 속성 고치기 폼 (24종류 + 2순위, 12색, 브랜드, 특징 ≤4, 제목, 설명) */
export function AttributeForm({
  value,
  onChange,
  errors,
}: {
  value: AttrForm;
  onChange: (next: AttrForm) => void;
  errors: Errors;
}) {
  const set = <K extends keyof AttrForm>(k: K, v: AttrForm[K]) => onChange({ ...value, [k]: v });
  const usedKeys = new Set(value.features.map((f) => f.key));
  return (
    <div className="flex flex-col gap-5">
      {errors.form && <ErrorText>{errors.form}</ErrorText>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="attr-category">종류</Label>
        <Select
          id="attr-category"
          value={value.category}
          invalid={!!errors.category}
          onChange={(v) => set("category", v as Category | "")}
        >
          <option value="">종류를 골라 주세요</option>
          {Category.options.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        {errors.category && <ErrorText>{errors.category}</ErrorText>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="attr-category-alt" sub="선택 · 후보 검색에만 써요">
          2순위 종류
        </Label>
        <Select
          id="attr-category-alt"
          value={value.categoryAlt}
          invalid={!!errors.categoryAlt}
          onChange={(v) => set("categoryAlt", v as Category | "")}
        >
          <option value="">없음</option>
          {Category.options.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        {errors.categoryAlt && <ErrorText>{errors.categoryAlt}</ErrorText>}
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-bold">색</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="색">
          {Color.options.map((c) => {
            const on = value.color === c;
            return (
              // biome-ignore lint/a11y/useSemanticElements: 칩 모양 라디오 (다시 누르면 해제)
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("color", on ? "" : c)}
                className={cn(
                  "flex min-h-touch items-center gap-2 rounded-md border border-line-strong bg-surface-card px-2.5 text-[14px]",
                  on && "border-2 border-brand bg-brand-soft font-bold",
                )}
              >
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-black/15"
                  style={{ background: COLOR_SWATCH[c] }}
                />
                <span className="truncate">{COLOR_LABELS[c]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="attr-brand" sub="선택">
          브랜드
        </Label>
        <Input
          id="attr-brand"
          value={value.brand}
          maxLength={40}
          aria-invalid={!!errors.brand}
          onChange={(e) => set("brand", e.target.value)}
        />
        {errors.brand && <ErrorText>{errors.brand}</ErrorText>}
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-bold">
          숨은 특징 <span className="font-normal text-ink-muted">최대 {MAX_FEATURES}개</span>
        </legend>
        {value.features.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 순서가 곧 식별자인 편집 목록
          <div key={i} className="flex items-center gap-2">
            <div className="w-[118px] shrink-0">
              <Select
                id={`feature-key-${i}`}
                value={f.key}
                onChange={(v) =>
                  set(
                    "features",
                    value.features.map((x, j) => (j === i ? { ...x, key: v as FeatureKey } : x)),
                  )
                }
              >
                {FeatureKey.options.map((k) => (
                  <option key={k} value={k}>
                    {FEATURE_KEY_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              aria-label={`특징 ${i + 1} 내용`}
              value={f.value}
              maxLength={40}
              className="min-w-0 flex-1"
              onChange={(e) =>
                set(
                  "features",
                  value.features.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              aria-label={`특징 ${i + 1} 지우기`}
              className="inline-flex size-touch shrink-0 items-center justify-center"
              onClick={() =>
                set(
                  "features",
                  value.features.filter((_, j) => j !== i),
                )
              }
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ))}
        {value.features.length < MAX_FEATURES && (
          <button
            type="button"
            className="inline-flex min-h-touch w-fit items-center gap-2 font-semibold text-brand"
            onClick={() =>
              set("features", [
                ...value.features,
                { key: FeatureKey.options.find((k) => !usedKeys.has(k)) ?? "other", value: "" },
              ])
            }
          >
            <Plus className="size-5" aria-hidden />
            특징 추가 ({value.features.length}/{MAX_FEATURES})
          </button>
        )}
        {errors.features && <ErrorText>{errors.features}</ErrorText>}
        <Hint>
          특징 종류는 정해진 {FeatureKey.options.length}개 중에서 골라요:{" "}
          {FeatureKey.options.map((k) => FEATURE_KEY_LABELS[k]).join(" / ")}
        </Hint>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="attr-title">제목</Label>
        <Input
          id="attr-title"
          value={value.title}
          maxLength={60}
          aria-invalid={!!errors.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <div className="flex justify-between gap-2">
          {errors.title ? <ErrorText>{errors.title}</ErrorText> : <span />}
          <span className="text-caption text-ink-subtle">{value.title.length} / 60</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="attr-description">설명</Label>
        <Textarea
          id="attr-description"
          value={value.description}
          maxLength={500}
          rows={3}
          aria-invalid={!!errors.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className="flex justify-between gap-2">
          {errors.description ? <ErrorText>{errors.description}</ErrorText> : <span />}
          <span className="text-caption text-ink-subtle">{value.description.length} / 500</span>
        </div>
      </div>
    </div>
  );
}
