import { z } from "zod";
import { Category, PickupMethod, PickupStatus } from "../enums";

/** POST /found-items/:id/pickup-qr: 보관처에 맡긴 물건의 수령 QR (체험 계정은 바로 완료) */
export const PickupQrResponse = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("CENTER_QR"),
    pickupId: z.string(),
    /** 프론트가 QR 이미지로 그린다. 서버에는 해시만 저장한다. */
    qrToken: z.string(),
    status: z.literal("ISSUED"),
    expiresAt: z.iso.datetime(),
  }),
  z.object({
    method: z.literal("DEMO"),
    pickupId: z.string(),
    status: z.literal("COMPLETED"),
    completedAt: z.iso.datetime(),
  }),
]);
export type PickupQrResponse = z.infer<typeof PickupQrResponse>;

/** POST /found-items/:id/self-pickup */
export const SelfPickupResponse = z.object({
  pickupId: z.string(),
  method: PickupMethod,
  status: PickupStatus,
  completedAt: z.iso.datetime(),
});
export type SelfPickupResponse = z.infer<typeof SelfPickupResponse>;

/** POST /admin/pickups/scan */
export const PickupScanRequest = z.object({ qrToken: z.string().min(1).max(200) });
export type PickupScanRequest = z.infer<typeof PickupScanRequest>;

export const PickupScanResponse = z.object({
  pickupId: z.string(),
  foundItem: z.object({
    id: z.string(),
    category: Category,
    building: z.string(),
    /** 원본 사진 서명 URL (관리자 확인용) */
    imageUrl: z.string().nullable(),
  }),
  claimant: z.object({ emailMasked: z.string() }),
  expiresAt: z.iso.datetime(),
});
export type PickupScanResponse = z.infer<typeof PickupScanResponse>;

export const PickupIdParams = z.object({ id: z.uuid() });

/** POST /admin/pickups/:id/complete */
export const PickupCompleteResponse = z.object({
  pickupId: z.string(),
  status: z.literal("COMPLETED"),
  completedAt: z.iso.datetime(),
});
export type PickupCompleteResponse = z.infer<typeof PickupCompleteResponse>;

/** 신분 확인 메모 최대 길이. 신분증 번호 전체는 적지 않게 안내한다 */
export const VERIFICATION_NOTE_MAX = 200;

/** POST /admin/found-items/:id/in-person-pickup: 대면 확인으로 넘어간 물건을 관리자가 신분 확인 후 수령 완료 (#29) */
export const InPersonPickupRequest = z.object({
  /** 예: "학생증 이름·학번 확인, 스티커 모양 설명 일치" */
  verificationNote: z.string().trim().min(1).max(VERIFICATION_NOTE_MAX),
});
export type InPersonPickupRequest = z.infer<typeof InPersonPickupRequest>;

export const InPersonPickupResponse = z.object({
  pickupId: z.string(),
  method: z.literal("IN_PERSON"),
  status: z.literal("COMPLETED"),
  completedAt: z.iso.datetime(),
});
export type InPersonPickupResponse = z.infer<typeof InPersonPickupResponse>;
