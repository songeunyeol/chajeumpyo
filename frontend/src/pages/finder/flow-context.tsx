import { MAX_IMAGE_MB, type StorageType } from "@chajeumpyo/shared";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet } from "react-router";
import { useRegisterFoundItem } from "@/data";
import type { SuggestionSource } from "@/lib/building-suggest";
import type { ConsentRecord } from "@/lib/consent-store";
import { loadConsent } from "@/lib/consent-store";

/** 받는 사진 형식 */
export const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export type PhotoError = "type" | "size" | null;

export function checkPhoto(file: File): PhotoError {
  const okType = /^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (!okType) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
}

/** F-02 입력. 좌표는 담지 않는다 (B14) */
export type FinderForm = {
  buildingId?: number;
  buildingSource: SuggestionSource | null;
  floor?: number;
  storageType?: StorageType;
  storagePlaceId?: number;
};

type Ctx = {
  photo: File | null;
  previewUrl: string | null;
  setPhoto: (f: File | null) => void;
  consent: ConsentRecord | null;
  setConsent: (c: ConsentRecord) => void;
  form: FinderForm;
  setForm: (f: FinderForm | ((prev: FinderForm) => FinderForm)) => void;
  register: ReturnType<typeof useRegisterFoundItem>;
  /** [등록하기]를 눌렀는지. 요청 상태가 idle → pending으로 바뀌기 전에 F-03이 먼저 그려져도 되돌아가지 않게 */
  submitted: boolean;
  submit: (input: Parameters<ReturnType<typeof useRegisterFoundItem>["mutate"]>[0]) => void;
  /** 입력은 두고 사진·결과만 비운다 (다시 찍기) */
  retake: () => void;
  /** 하나 더 등록: 사진·입력·결과를 비운다 */
  resetAll: () => void;
};

const FinderCtx = createContext<Ctx | null>(null);

export function useFinderFlow(): Ctx {
  const c = useContext(FinderCtx);
  if (!c) throw new Error("useFinderFlow는 FinderFlowLayout 안에서만");
  return c;
}

const EMPTY_FORM: FinderForm = { buildingSource: null };

/** /found/new/* 공통 상태. 화면을 옮겨 다녀도 사진·입력·등록 요청이 유지된다 */
export function FinderFlowLayout() {
  const [photo, setPhotoState] = useState<File | null>(null);
  const [consent, setConsent] = useState<ConsentRecord | null>(() => loadConsent("finder"));
  const [form, setForm] = useState<FinderForm>(EMPTY_FORM);
  const register = useRegisterFoundItem();
  const [submitted, setSubmitted] = useState(false);
  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (lastUrl.current && lastUrl.current !== previewUrl) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = previewUrl;
  }, [previewUrl]);

  const value: Ctx = {
    photo,
    previewUrl,
    setPhoto: setPhotoState,
    consent,
    setConsent,
    form,
    setForm,
    register,
    submitted,
    submit: (input) => {
      setSubmitted(true);
      register.mutate(input);
    },
    retake: () => {
      setSubmitted(false);
      setPhotoState(null);
      register.reset();
    },
    resetAll: () => {
      setSubmitted(false);
      setPhotoState(null);
      setForm(EMPTY_FORM);
      register.reset();
    },
  };
  return (
    <FinderCtx.Provider value={value}>
      <Outlet />
    </FinderCtx.Provider>
  );
}
