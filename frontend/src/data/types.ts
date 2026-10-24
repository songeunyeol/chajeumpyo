import type {
  AdminFoundItemListQuery,
  AuthUser,
  DemoConsent,
  HotspotQuery,
  MemberConsent,
  StorageType,
} from "@chajeumpyo/shared";

/**
 * 화면이 기대하는 데이터 훅의 입력 모양. 연결 작업(src/api)이 같은 이름·모양으로 만든다.
 * 오류는 `{ status: number; code: ErrorCode; message: string }` 모양 객체로 던진다 (lib/errors.ts가 읽는다).
 */

/** 로그인 상태. 화면은 이 모양만 본다 */
export type Session = {
  user: AuthUser | null;
  isDemo: boolean;
  isAdmin: boolean;
  /** 관리자 소속 보관처 */
  storagePlace: { id: number; name: string } | null;
};

/** POST /found-items (multipart). 캡차 토큰은 X-Captcha-Token 헤더로 */
export type RegisterFoundItemInput = {
  image: File;
  buildingId: number;
  storageType: StorageType;
  storagePlaceId?: number;
  floor?: number;
  consent: { version: string; externalAi: boolean; location: boolean };
  captchaToken: string;
};

/** POST /auth/demo (+ X-Captcha-Token) */
export type DemoLoginInput = { consent: DemoConsent; captchaToken: string };

/** POST /auth/signup */
export type SignupInput = { verificationToken: string; password: string; consent: MemberConsent };

export type AdminListParams = Partial<AdminFoundItemListQuery>;
export type HotspotParams = HotspotQuery;
