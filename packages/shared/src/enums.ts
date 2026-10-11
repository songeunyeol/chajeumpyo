import { z } from "zod";

// ERD(02_ERD.md)의 enum과 이름·값을 맞춘다. 바꾸면 backend/prisma/schema.prisma도 같이 바꾼다.

export const Category = z.enum([
  "EARPHONE",
  "CHARGER",
  "UMBRELLA",
  "CARD",
  "WALLET",
  "TUMBLER",
  "PENCIL_CASE",
  "LAPTOP_TABLET",
  "CLOTHING_BAG",
  "ETC",
]);
export type Category = z.infer<typeof Category>;

/** 화면 표시용 한국어 이름 */
export const CATEGORY_LABELS: Record<Category, string> = {
  EARPHONE: "무선 이어폰",
  CHARGER: "충전기·보조배터리",
  UMBRELLA: "우산",
  CARD: "학생증·카드",
  WALLET: "지갑",
  TUMBLER: "텀블러",
  PENCIL_CASE: "필통·필기구",
  LAPTOP_TABLET: "노트북·태블릿",
  CLOTHING_BAG: "옷·가방",
  ETC: "기타",
};

/**
 * 연관 종류 묶음 (초안, 기능 명세서 F-07). 신고 종류로 후보를 찾을 때 함께 찾는 종류.
 * ETC는 모든 종류와 묶이므로 아래 relatedCategories()에서 따로 처리한다.
 */
export const RELATED_CATEGORIES: Partial<Record<Category, Category[]>> = {
  EARPHONE: ["CHARGER"],
  CHARGER: ["EARPHONE", "LAPTOP_TABLET"],
  WALLET: ["CARD"],
  CARD: ["WALLET"],
  LAPTOP_TABLET: ["CHARGER"],
};

/** 신고 종류로 후보 검색할 때 볼 종류 전체 (자기 자신 포함) */
export function relatedCategories(category: Category): Category[] {
  if (category === "ETC") return [...Category.options];
  return [category, ...(RELATED_CATEGORIES[category] ?? []), "ETC"];
}

export const Role = z.enum(["USER", "ADMIN", "DEMO"]);
export type Role = z.infer<typeof Role>;

/** 보관처 운영 주체 */
export const StorageOrg = z.enum(["CENTER", "GUARD"]);
export type StorageOrg = z.infer<typeof StorageOrg>;

/** 그 자리에 둠 / 보관처에 맡김 */
export const StorageType = z.enum(["IN_PLACE", "HANDED_OVER"]);
export type StorageType = z.infer<typeof StorageType>;

export const FoundStatus = z.enum(["ANALYZING", "REVIEW", "REGISTERED", "REVEALED", "CLAIMED", "EXPIRED"]);
export type FoundStatus = z.infer<typeof FoundStatus>;

export const ReportStatus = z.enum(["OPEN", "RESOLVED", "CLOSED"]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const MatchResult = z.enum(["PASS", "BORDERLINE", "FAIL"]);
export type MatchResult = z.infer<typeof MatchResult>;

/** DEMO: 체험 계정의 수령. 시드 상태를 바꾸지 않고 "완료는 물건당 1건" 규칙에서도 빠진다. */
export const PickupMethod = z.enum(["CENTER_QR", "SELF_REPORT", "DEMO"]);
export type PickupMethod = z.infer<typeof PickupMethod>;

export const PickupStatus = z.enum(["ISSUED", "COMPLETED", "EXPIRED"]);
export type PickupStatus = z.infer<typeof PickupStatus>;

export const NotificationType = z.enum(["NEW_CANDIDATE", "MULTI_REVEAL", "SYSTEM"]);
export type NotificationType = z.infer<typeof NotificationType>;
