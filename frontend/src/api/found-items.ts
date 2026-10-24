import {
  CONSENT_VERSION,
  FoundItemDetailResponse,
  PickupQrResponse,
  RegisterFoundItemResponse,
  SelfPickupResponse,
  type StorageType,
} from "@chajeumpyo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_TIMEOUT_MS, request } from "@/lib/http";
import { prepareUploadImage } from "./image";
import { qk } from "./keys";

// F-02~F-04 습득물 등록(로그인 없음), L-10 사진·위치 공개, L-11 수령 QR, L-12 수령 완료

export type RegisterFoundItemInput = {
  image: Blob;
  buildingId: number;
  storageType: StorageType;
  /** HANDED_OVER일 때만 */
  storagePlaceId?: number;
  /** 지하는 음수, 모르면 생략 */
  floor?: number;
  /** C-02 동의. version은 CONSENT_VERSION, externalAi는 true여야 서버가 받는다 */
  consent: { version?: string; externalAi?: boolean; location: boolean };
  captchaToken?: string;
  /** 이미 prepareUploadImage를 거친 사진이면 true */
  prepared?: boolean;
};

/**
 * multipart 본문. 좌표(lat/lng)는 받지도 넣지도 않는다 (B14). 건물은 브라우저 안에서 고른 id만.
 * e2e가 이 본문을 가로채 좌표가 없는지 확인한다 (frontend/e2e).
 */
export async function buildRegisterForm(input: RegisterFoundItemInput): Promise<FormData> {
  const image = input.prepared ? input.image : await prepareUploadImage(input.image);
  const form = new FormData();
  form.append("image", image, image.type === "image/jpeg" ? "photo.jpg" : "photo");
  form.append("buildingId", String(input.buildingId));
  form.append("storageType", input.storageType);
  if (input.storageType === "HANDED_OVER" && input.storagePlaceId !== undefined) {
    form.append("storagePlaceId", String(input.storagePlaceId));
  }
  if (input.floor !== undefined && Number.isFinite(input.floor)) form.append("floor", String(input.floor));
  form.append("consentVersion", input.consent.version ?? CONSENT_VERSION);
  form.append("consentExternalAi", input.consent.externalAi === false ? "false" : "true");
  form.append("consentLocation", input.consent.location ? "true" : "false");
  return form;
}

/**
 * F-02 [등록하기] → F-03 대기 → F-04 결과.
 * 실제 AI는 최대 10초 가까이 걸린다(제한 30초). 결과 status가 REVIEW면 "검토 대기" 화면.
 * 오류 코드: NO_OBJECT_DETECTED(422, 다시 찍기), IMAGE_TOO_LARGE(413), RATE_LIMITED(429), AI_UNAVAILABLE(502), CAPTCHA_FAILED
 */
export function useRegisterFoundItem() {
  return useMutation({
    mutationFn: async (input: RegisterFoundItemInput) =>
      request("/found-items", {
        form: await buildRegisterForm(input),
        captchaToken: input.captchaToken,
        schema: RegisterFoundItemResponse,
        timeoutMs: AI_TIMEOUT_MS,
      }),
  });
}

/**
 * L-10: 판정을 통과한 계정만(아니면 FORBIDDEN). 볼 때마다 서버에 열람 기록이 남으므로 자동 새로고침을 끈다.
 * imageUrl은 10분 뒤 만료 → 9분 지나면 다시 받는다.
 */
export function useFoundItemDetail(foundItemId: string | undefined) {
  return useQuery({
    queryKey: qk.foundItemDetail(foundItemId ?? ""),
    queryFn: ({ signal }) =>
      request(`/found-items/${foundItemId}/detail`, { auth: "member", schema: FoundItemDetailResponse, signal }),
    enabled: !!foundItemId,
    staleTime: 9 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/**
 * L-11: 수령 QR 받기(다시 받으면 이전 QR은 만료). 체험 계정은 method DEMO로 바로 수령 완료(L-12).
 * 오류: INVALID_STORAGE_TYPE(그 자리에 둔 물건), ALREADY_CLAIMED, FORBIDDEN
 */
export function useIssuePickupQr(foundItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(`/found-items/${foundItemId}/pickup-qr`, { method: "POST", auth: "member", schema: PickupQrResponse }),
    onSuccess: (r) => {
      if (r.method === "DEMO") invalidateAfterPickup(qc, foundItemId);
    },
  });
}

/** L-12 [찾았어요]: 그 자리에 둔 물건을 가져갔다고 알림 */
export function useSelfPickup(foundItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(`/found-items/${foundItemId}/self-pickup`, {
        method: "POST",
        auth: "member",
        schema: SelfPickupResponse,
      }),
    onSuccess: () => invalidateAfterPickup(qc, foundItemId),
  });
}

function invalidateAfterPickup(qc: ReturnType<typeof useQueryClient>, foundItemId: string) {
  void qc.invalidateQueries({ queryKey: qk.lostReports });
  // 수령 뒤 상세는 다시 부르지 않는다(열람 기록). 캐시만 버린다
  qc.removeQueries({ queryKey: qk.foundItemDetail(foundItemId) });
  void qc.invalidateQueries({ queryKey: qk.notifications("member") });
}
