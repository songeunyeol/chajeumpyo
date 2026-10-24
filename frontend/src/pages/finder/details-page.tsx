import { CONSENT_VERSION, RegisterFoundItemFields } from "@chajeumpyo/shared";
import { Building2, MapPin, Store } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Captcha } from "@/components/captcha";
import { BandHeader, Screen, StepCount } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Chip, OptionList, Segment } from "@/components/ui/chips";
import { ErrorText, Hint, SectionLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Tag } from "@/components/ui/status";
import { useBuildings, useStoragePlaces } from "@/data";
import { SUGGESTION_SOURCE_LABELS, suggestBuilding } from "@/lib/building-suggest";
import { formatFloor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BuildingSheet } from "./building-sheet";
import { useFinderFlow } from "./flow-context";

/** 층 칩: 지하 1층 ~ 15층 */
const FLOORS = [-1, ...Array.from({ length: 15 }, (_, i) => i + 1)];
const floorChip = (f: number) => (f < 0 ? `B${-f}` : `${f}층`);

/** F-02 등록 정보: 건물(추천) · 층 · 보관 · 캡차 → [등록하기] */
export function FinderDetailsPage() {
  const navigate = useNavigate();
  const { photo, previewUrl, consent, form, setForm, register, submit: startRegister } = useFinderFlow();
  const buildings = useBuildings();
  const list = buildings.data?.buildings ?? [];
  const places = useStoragePlaces(form.buildingId);
  const [sheet, setSheet] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggested = useRef(false);

  // 건물 추천: 사진 EXIF → (위치 동의 시) 브라우저 위치 → 직접. 좌표는 이 안에서 건물로 바뀌고 버려진다
  useEffect(() => {
    if (suggested.current || !photo || list.length === 0 || form.buildingId) return;
    suggested.current = true;
    void suggestBuilding(photo, list, consent?.location ?? false).then((s) => {
      if (s.building) {
        const id = s.building.id;
        setForm((f) => (f.buildingId ? f : { ...f, buildingId: id, buildingSource: s.source }));
      } else {
        setForm((f) => ({ ...f, buildingSource: "manual" }));
        setSheet(true);
      }
    });
  }, [photo, list, consent, form.buildingId, setForm]);

  if (!photo || !consent) return <Navigate to="/found/new" replace />;

  const building = list.find((b) => b.id === form.buildingId);
  const suggesting = !building && form.buildingSource === null;

  const submit = () => {
    const parsed = RegisterFoundItemFields.safeParse({
      buildingId: form.buildingId,
      storageType: form.storageType,
      storagePlaceId: form.storageType === "HANDED_OVER" ? form.storagePlaceId : undefined,
      floor: form.floor,
      consentVersion: CONSENT_VERSION,
      consentExternalAi: String(consent.externalAi),
      consentLocation: String(consent.location),
    });
    const errs: Record<string, string> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    }
    if (!form.buildingId) errs.buildingId = "주운 건물을 골라 주세요.";
    if (!form.storageType) errs.storageType = "물건을 지금 어디에 뒀는지 골라 주세요.";
    if (!token) errs.captcha = "사람인지 확인해 주세요.";
    setErrors(errs);
    if (!parsed.success || Object.keys(errs).length > 0 || !token) return;
    const v = parsed.data;
    startRegister({
      image: photo,
      buildingId: v.buildingId,
      storageType: v.storageType,
      storagePlaceId: v.storagePlaceId,
      floor: v.floor,
      consent: { version: v.consentVersion, externalAi: v.consentExternalAi, location: v.consentLocation },
      captchaToken: token,
    });
    navigate("/found/new/uploading");
  };

  return (
    <Screen
      flow="finder"
      header={
        <BandHeader variant="finder" back="/found/new" title="등록 정보" right={<StepCount current={2} total={2} />} />
      }
      footer={
        <Button onClick={submit} disabled={register.isPending}>
          등록하기
        </Button>
      }
    >
      <section className="flex flex-col gap-2" aria-labelledby="f-where">
        <h2 id="f-where" className="m-0 text-[15px] font-bold">
          어디서 주웠나요?
        </h2>
        <div className="flex items-center gap-3.5 rounded-lg bg-surface-card p-3.5 shadow-card">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-[60px] shrink-0 rounded-md bg-[#CFC8BB] object-cover" />
          ) : (
            <span className="size-[60px] shrink-0 rounded-md bg-[#CFC8BB]" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {suggesting ? (
              <>
                <Skeleton className="h-6 w-20" />
                <span className="text-small text-ink-muted">가까운 건물을 찾는 중이에요</span>
              </>
            ) : building ? (
              <>
                <b className="text-body-lg font-bold">{building.name}</b>
                {form.buildingSource && (
                  <span className="flex items-center gap-1 text-small font-semibold text-brand">
                    {form.buildingSource === "manual" ? (
                      <Building2 className="size-4" aria-hidden />
                    ) : (
                      <MapPin className="size-4" aria-hidden />
                    )}
                    {form.buildingSource === "manual" ? "직접 골랐어요" : SUGGESTION_SOURCE_LABELS[form.buildingSource]}
                  </span>
                )}
              </>
            ) : (
              <>
                <b className="text-body-lg font-bold text-ink-muted">건물을 골라 주세요</b>
                <span className="text-small text-ink-muted">사진에 위치 정보가 없어요</span>
              </>
            )}
          </div>
          <Button
            variant="secondary"
            size="md"
            className="shrink-0"
            onClick={() => setSheet(true)}
            disabled={list.length === 0}
          >
            {building ? "바꾸기" : "고르기"}
          </Button>
        </div>
        {errors.buildingId ? (
          <ErrorText>{errors.buildingId}</ErrorText>
        ) : (
          <Hint>위치는 건물을 고르는 데만 쓰고 서버로 보내지 않아요.</Hint>
        )}
        {buildings.isError && <ErrorText>건물 목록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</ErrorText>}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="f-floor">
        <h2 id="f-floor" className="m-0 text-[15px] font-bold">
          층 <span className="font-normal text-ink-subtle">선택</span>
        </h2>
        <div className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none]">
          {FLOORS.map((f) => (
            <Chip
              key={f}
              selected={form.floor === f}
              aria-label={formatFloor(f)}
              onClick={() => setForm((x) => ({ ...x, floor: x.floor === f ? undefined : f }))}
              className="min-w-[60px] shrink-0 justify-center"
            >
              {floorChip(f)}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[15px] font-bold">물건은 지금 어디 있나요?</h2>
        <Segment
          label="물건은 지금 어디 있나요?"
          value={form.storageType}
          onChange={(v) =>
            setForm((x) => ({ ...x, storageType: v, storagePlaceId: v === "IN_PLACE" ? undefined : x.storagePlaceId }))
          }
          options={[
            { value: "IN_PLACE", title: "그 자리에 둠", desc: "발견한 곳에 그대로", icon: MapPin },
            { value: "HANDED_OVER", title: "보관처에 맡김", desc: "센터·경비실에 전달", icon: Store },
          ]}
        />
        {errors.storageType && <ErrorText>{errors.storageType}</ErrorText>}
      </section>

      {form.storageType === "HANDED_OVER" && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-[15px] font-bold">어느 보관처에 맡겼나요?</h2>
          {places.isPending ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <OptionList
              label="어느 보관처에 맡겼나요?"
              value={form.storagePlaceId}
              onChange={(id) => setForm((x) => ({ ...x, storagePlaceId: id }))}
              options={(places.data?.storagePlaces ?? []).map((p) => ({
                value: p.id,
                title: (
                  <span className="flex items-center gap-1.5">
                    {p.name}
                    {p.sameBuilding && <Tag>같은 건물</Tag>}
                  </span>
                ),
                desc: p.guideText,
              }))}
            />
          )}
          {errors.storagePlaceId && <ErrorText>{errors.storagePlaceId}</ErrorText>}
        </section>
      )}

      <div className={cn("flex flex-col gap-1.5")}>
        <SectionLabel className="sr-only">사람 확인</SectionLabel>
        <Captcha onToken={setToken} />
        {errors.captcha && <ErrorText>{errors.captcha}</ErrorText>}
      </div>

      <BuildingSheet
        key={`${sheet}`}
        open={sheet}
        onOpenChange={setSheet}
        buildings={list}
        value={form.buildingId}
        onPick={(id) => {
          setForm((x) => ({ ...x, buildingId: id, buildingSource: "manual", storagePlaceId: undefined }));
          setSheet(false);
        }}
      />
    </Screen>
  );
}
