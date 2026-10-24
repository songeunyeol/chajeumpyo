/**
 * 화면이 쓰는 데이터 훅의 단일 진입점. 화면 컴포넌트는 fetch를 직접 부르지 않고 여기 훅만 쓴다.
 * 기본은 실제 서버 훅(`@/api`, 연결 작업 소유). VITE_USE_MOCKS=true면 화면 확인·테스트용 가짜 훅(`./mock`).
 * 훅 이름·입력은 src/api/README.md 표를 따른다.
 */
import * as real from "@/api";
import { USE_MOCKS } from "@/lib/env";
import * as mock from "./mock/hooks";

type Real = typeof real;
const pick = <K extends keyof Real & keyof typeof mock>(k: K): Real[K] =>
  // biome-ignore lint/performance/noDynamicNamespaceImportAccess: 훅 30개를 한 줄씩 고르는 교체 지점. 두 모듈 모두 어차피 전부 쓴다
  (USE_MOCKS ? (mock[k] as unknown as Real[K]) : real[k]) as Real[K];

export const useSession = pick("useSession");
export const useLogout = pick("useLogout");
export const useLogin = pick("useLogin");
export const useAdminLogin = pick("useAdminLogin");
export const useDemoLogin = pick("useDemoLogin");
export const useRequestEmailCode = pick("useRequestEmailCode");
export const useVerifyEmailCode = pick("useVerifyEmailCode");
export const useSignup = pick("useSignup");
export const useMe = pick("useMe");
export const useBuildings = pick("useBuildings");
export const useStoragePlaces = pick("useStoragePlaces");
export const useRegisterFoundItem = pick("useRegisterFoundItem");
export const useLostReports = pick("useLostReports");
export const useCandidates = pick("useCandidates");
export const useCreateLostReport = pick("useCreateLostReport");
export const useUpdateLostReport = pick("useUpdateLostReport");
export const useClaim = pick("useClaim");
export const useAnswer = pick("useAnswer");
export const useFoundItemDetail = pick("useFoundItemDetail");
export const useIssuePickupQr = pick("useIssuePickupQr");
export const useSelfPickup = pick("useSelfPickup");
export const useNotifications = pick("useNotifications");
export const useMarkNotificationRead = pick("useMarkNotificationRead");
export const useMarkAllNotificationsRead = pick("useMarkAllNotificationsRead");
export const useAdminFoundItems = pick("useAdminFoundItems");
export const useAdminFoundItem = pick("useAdminFoundItem");
export const useUpdateAdminFoundItem = pick("useUpdateAdminFoundItem");
export const useInPersonPickup = pick("useInPersonPickup");
export const useScanPickup = pick("useScanPickup");
export const useCompletePickup = pick("useCompletePickup");
export const useHotspots = pick("useHotspots");

export { ApiProvider, isApiError, maskEmail, prepareUploadImage } from "@/api";
export type * from "./types";
