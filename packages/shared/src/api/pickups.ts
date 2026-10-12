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
