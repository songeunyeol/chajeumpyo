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

/**
 * 색. LOST112 색 코드(FD_COL_CD) 123개를 화면용 기본 12색으로 묶은 값만 저장한다 (docs/api/LOST112.md, QA B2).
 * LOST112와 주고받을 때만 아래 코드 목록으로 바꾼다.
 */
export const Color = z.enum([
  "WHITE",
  "BLACK",
  "GRAY_SILVER",
  "RED",
  "ORANGE_CORAL",
  "YELLOW",
  "GREEN",
  "BLUE_TEAL",
  "PURPLE",
  "PINK_MAGENTA",
  "BROWN",
  "OTHER",
]);
export type Color = z.infer<typeof Color>;

export const COLOR_LABELS: Record<Color, string> = {
  WHITE: "흰색",
  BLACK: "검정",
  GRAY_SILVER: "회색·은색",
  RED: "빨강",
  ORANGE_CORAL: "주황·코럴",
  YELLOW: "노랑",
  GREEN: "초록",
  BLUE_TEAL: "파랑·청록",
  PURPLE: "보라",
  PINK_MAGENTA: "분홍·자홍",
  BROWN: "갈색",
  OTHER: "기타",
};

/** 기본 12색 → LOST112 색 코드 (docs/api/LOST112.md "색상 권장안") */
export const COLOR_LOST112_CODES: Record<Color, string[]> = {
  WHITE: ["CL1001", "CL1018"],
  BLACK: ["CL1002", "CL1043"],
  GRAY_SILVER: [
    "CL1019",
    "CL1020",
    "CL1021",
    "CL1022",
    "CL1023",
    "CL1024",
    "CL1025",
    "CL1026",
    "CL1027",
    "CL1034",
    "CL1035",
    "CL1036",
    "CL1037",
    "CL1038",
    "CL1039",
    "CL1040",
    "CL1041",
    "CL1042",
  ],
  RED: ["CL1003", "CL1012", "CL1028", "CL1059", "CL1075", "CL1076", "CL1092", "CL1108", "CL1123"],
  ORANGE_CORAL: [
    "CL1004",
    "CL1044",
    "CL1045",
    "CL1046",
    "CL1060",
    "CL1061",
    "CL1062",
    "CL1077",
    "CL1078",
    "CL1093",
    "CL1094",
  ],
  YELLOW: ["CL1005", "CL1013", "CL1029", "CL1047", "CL1063", "CL1079"],
  GREEN: [
    "CL1006",
    "CL1014",
    "CL1030",
    "CL1048",
    "CL1049",
    "CL1050",
    "CL1064",
    "CL1065",
    "CL1066",
    "CL1080",
    "CL1081",
    "CL1082",
    "CL1095",
    "CL1096",
    "CL1097",
    "CL1098",
    "CL1111",
    "CL1112",
    "CL1113",
    "CL1114",
  ],
  BLUE_TEAL: [
    "CL1007",
    "CL1016",
    "CL1032",
    "CL1052",
    "CL1053",
    "CL1054",
    "CL1055",
    "CL1068",
    "CL1069",
    "CL1070",
    "CL1071",
    "CL1084",
    "CL1085",
    "CL1086",
    "CL1087",
    "CL1100",
    "CL1101",
    "CL1102",
    "CL1116",
    "CL1117",
    "CL1118",
    "CL1015",
    "CL1031",
    "CL1051",
    "CL1067",
    "CL1083",
    "CL1099",
    "CL1115",
  ],
  PURPLE: ["CL1009", "CL1056", "CL1072", "CL1088", "CL1103", "CL1104", "CL1119", "CL1120"],
  PINK_MAGENTA: [
    "CL1011",
    "CL1017",
    "CL1033",
    "CL1057",
    "CL1058",
    "CL1073",
    "CL1074",
    "CL1089",
    "CL1090",
    "CL1091",
    "CL1105",
    "CL1106",
    "CL1107",
    "CL1121",
    "CL1122",
  ],
  BROWN: ["CL1008", "CL1109", "CL1110"],
  OTHER: ["CL1010"],
};

/**
 * 서로 헷갈리기 쉬운 이웃 색. 신고 색과 습득물 색이 이웃이면 모순이 아니라 확인 불가로 본다 (open-issues #24).
 * 예: 아이보리는 흰색·회색 어느 쪽으로도 찍힐 수 있다.
 */
const NEIGHBOR_COLORS: [Color, Color][] = [
  ["WHITE", "GRAY_SILVER"],
  ["GRAY_SILVER", "BLACK"],
  ["RED", "ORANGE_CORAL"],
  ["RED", "PINK_MAGENTA"],
  ["ORANGE_CORAL", "YELLOW"],
  ["ORANGE_CORAL", "BROWN"],
  ["BROWN", "BLACK"],
  ["GREEN", "BLUE_TEAL"],
  ["BLUE_TEAL", "PURPLE"],
  ["PURPLE", "PINK_MAGENTA"],
];

/** 두 색이 이웃 색인지 (같은 색은 false) */
export function areNeighborColors(a: Color, b: Color): boolean {
  return NEIGHBOR_COLORS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 숨은 특징의 종류. 자유 텍스트를 막아 질문 만들기·비교를 일정하게 한다 */
export const FeatureKey = z.enum(["sticker", "scratch", "case", "keyring", "contents", "text", "pattern", "other"]);
export type FeatureKey = z.infer<typeof FeatureKey>;

export const FEATURE_KEY_LABELS: Record<FeatureKey, string> = {
  sticker: "스티커",
  scratch: "흠집·긁힘",
  case: "케이스·커버",
  keyring: "키링·고리",
  contents: "안에 든 것",
  text: "글자·각인",
  pattern: "무늬·그림",
  other: "기타 특징",
};

/** 습득물 하나에 저장하는 숨은 특징 최대 개수 */
export const MAX_FEATURES = 4;

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
