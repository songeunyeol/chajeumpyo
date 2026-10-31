import { z } from "zod";

// ERD(docs/spec/02_ERD.md)의 enum과 이름·값을 맞춘다. 바꾸면 backend/prisma/schema.prisma도 같이 바꾼다.

export const Category = z.enum([
  "WALLET",
  "ID_CARD",
  "DRIVER_LICENSE",
  "PAYMENT_CARD",
  "TRANSIT_CARD",
  "OTHER_CARD",
  "PHONE",
  "EARPHONE",
  "SMARTWATCH",
  "TABLET",
  "LAPTOP",
  "CHARGER",
  "BAG",
  "CLOTHING",
  "HAT",
  "BOOK",
  "GLASSES",
  "ACCESSORY",
  "CASH",
  "UMBRELLA",
  "TUMBLER",
  "KEY",
  "STATIONERY",
  "ETC",
]);
export type Category = z.infer<typeof Category>;

/** 화면 표시용 한국어 이름 */
export const CATEGORY_LABELS: Record<Category, string> = {
  WALLET: "지갑",
  ID_CARD: "학생증·신분증",
  DRIVER_LICENSE: "운전면허증",
  PAYMENT_CARD: "체크·신용카드",
  TRANSIT_CARD: "교통카드",
  OTHER_CARD: "기타 카드",
  PHONE: "휴대폰",
  EARPHONE: "무선 이어폰",
  SMARTWATCH: "스마트워치",
  TABLET: "태블릿",
  LAPTOP: "노트북",
  CHARGER: "기타 전자기기",
  BAG: "가방",
  CLOTHING: "의류",
  HAT: "모자",
  BOOK: "교재·도서",
  GLASSES: "안경·선글라스",
  ACCESSORY: "시계·액세서리",
  CASH: "현금",
  UMBRELLA: "우산",
  TUMBLER: "텀블러·물병",
  KEY: "열쇠",
  STATIONERY: "필기구·필통",
  ETC: "기타",
};

/**
 * 세부 종류. 큰 종류(24개, LOST112 매핑·후보 검색 기준)는 그대로 두고, 나누는 의미가 큰 종류에만 한 단계 더 붙인다.
 * 후보 점수에서 같은 큰 종류 안의 세부 종류가 다르면 깎는다(matching/policy.ts). 공개 정보이며 화면에 이름으로 보여 준다.
 */
export const SUB_CATEGORY_LABELS = {
  CABLE_CHARGER: "충전기·케이블",
  POWER_BANK: "보조배터리",
  MOUSE: "마우스",
  KEYBOARD: "키보드",
  USB_MEMORY: "USB·메모리",
  CAMERA: "카메라",
  GAME_CONSOLE: "게임기",
  WIRELESS_EARBUDS: "무선 이어폰",
  WIRED_EARPHONE: "유선 이어폰",
  HEADPHONE: "헤드폰",
  BACKPACK: "백팩",
  SHOULDER_BAG: "숄더·토트백",
  ECO_BAG: "에코백",
  POUCH: "파우치",
  SHOPPING_BAG: "쇼핑백",
  OUTER: "외투",
  TOP: "상의",
  BOTTOM: "하의",
  SCARF_GLOVES: "목도리·장갑",
  SHOES: "신발",
  LONG_WALLET: "장지갑",
  BIFOLD_WALLET: "반지갑",
  CARD_WALLET: "카드지갑",
  WRISTWATCH: "손목시계",
  JEWELRY: "반지·목걸이·귀걸이",
  HAIR_ACCESSORY: "머리핀·머리끈",
  TEXTBOOK: "전공책",
  NOTEBOOK: "노트·공책",
  PENCIL_CASE: "필통",
  CALCULATOR: "계산기",
  PEN: "펜",
  DOOR_KEY: "열쇠",
  CAR_KEY: "자동차 키",
  DOLL_KEYRING: "인형·키링",
  COSMETICS: "화장품",
  MEDICINE: "약·의약품",
} as const;

export type SubCategory = keyof typeof SUB_CATEGORY_LABELS;
export const SubCategory = z.enum(Object.keys(SUB_CATEGORY_LABELS) as [SubCategory, ...SubCategory[]]);

/** 큰 종류별 세부 종류. 없는 큰 종류는 세부 종류를 쓰지 않는다 */
export const SUB_CATEGORIES: Partial<Record<Category, readonly SubCategory[]>> = {
  CHARGER: ["CABLE_CHARGER", "POWER_BANK", "MOUSE", "KEYBOARD", "USB_MEMORY", "CAMERA", "GAME_CONSOLE"],
  EARPHONE: ["WIRELESS_EARBUDS", "WIRED_EARPHONE", "HEADPHONE"],
  BAG: ["BACKPACK", "SHOULDER_BAG", "ECO_BAG", "POUCH", "SHOPPING_BAG"],
  CLOTHING: ["OUTER", "TOP", "BOTTOM", "SCARF_GLOVES", "SHOES"],
  WALLET: ["LONG_WALLET", "BIFOLD_WALLET", "CARD_WALLET"],
  ACCESSORY: ["WRISTWATCH", "JEWELRY", "HAIR_ACCESSORY"],
  BOOK: ["TEXTBOOK", "NOTEBOOK"],
  STATIONERY: ["PENCIL_CASE", "CALCULATOR", "PEN"],
  KEY: ["DOOR_KEY", "CAR_KEY"],
  ETC: ["DOLL_KEYRING", "COSMETICS", "MEDICINE"],
};

/** 세부 종류가 그 큰 종류에 속하면 그대로, 아니면(다른 종류의 세부 종류·없음) null */
export function subCategoryWithin(category: Category | null, sub: unknown): SubCategory | null {
  if (!category || typeof sub !== "string") return null;
  return (SUB_CATEGORIES[category] as readonly string[] | undefined)?.includes(sub) ? (sub as SubCategory) : null;
}

/** 화면에 보여 줄 이름: 세부 종류가 있으면 그 이름, 없으면 큰 종류 이름 */
export function itemLabel(category: Category, sub: SubCategory | null | undefined): string {
  return sub ? SUB_CATEGORY_LABELS[sub] : CATEGORY_LABELS[category];
}

/** LOST112 물품분류 코드. `prdtCl02`가 null이면 대분류 전체 */
export type Lost112CategoryCode = { prdtCl01: string; prdtCl02: string | null };

const lost112 = (prdtCl01: string, ...prdtCl02: string[]): Lost112CategoryCode[] =>
  prdtCl02.length === 0 ? [{ prdtCl01, prdtCl02: null }] : prdtCl02.map((c) => ({ prdtCl01, prdtCl02: c }));

/**
 * 종류 → LOST112 물품분류 코드 (docs/api/LOST112.md "우리 서비스 분류"). LOST112를 검색하거나 가져올 때 쓴다.
 * 우산·텀블러·열쇠·필기구는 LOST112에 전용 코드가 없어 기타(PRZ100)로 찾는다. 자동차 열쇠는 PRF100.
 */
export const CATEGORY_LOST112_CODES: Record<Category, Lost112CategoryCode[]> = {
  WALLET: lost112("PRH000"),
  ID_CARD: lost112("PRN000", "PRN100"),
  DRIVER_LICENSE: lost112("PRN000", "PRN200"),
  PAYMENT_CARD: lost112("PRP000", "PRP100"),
  TRANSIT_CARD: lost112("PRP000", "PRP400"),
  OTHER_CARD: lost112("PRP000", "PRP300"),
  PHONE: lost112("PRJ000"),
  EARPHONE: lost112("PRG000", "PRG900"),
  SMARTWATCH: lost112("PRG000", "PRG800"),
  TABLET: lost112("PRG000", "PRG700"),
  LAPTOP: lost112("PRI000"),
  CHARGER: lost112("PRG000", "PRG600"),
  BAG: lost112("PRA000"),
  CLOTHING: lost112("PRK000", "PRK100", "PRK200", "PRK400"),
  HAT: lost112("PRK000", "PRK500"),
  BOOK: lost112("PRB000"),
  GLASSES: lost112("PRZ000", "PRZ700", "PRZ600"),
  ACCESSORY: lost112("PRO000"),
  CASH: lost112("PRL000", "PRL100"),
  UMBRELLA: lost112("PRZ000", "PRZ100"),
  TUMBLER: lost112("PRZ000", "PRZ100"),
  KEY: [...lost112("PRF000", "PRF100"), ...lost112("PRZ000", "PRZ100")],
  STATIONERY: lost112("PRZ000", "PRZ100"),
  ETC: lost112("PRZ000", "PRZ100"),
};

/**
 * LOST112 물품분류 코드 → 종류. 중분류가 한 종류에만 맞으면 그 종류, 아니면 대분류 전체로 묶인 종류.
 * 여러 종류가 함께 쓰는 코드(PRZ100 기타)나 모르는 코드는 ETC.
 */
export function categoryFromLost112(prdtCl01: string, prdtCl02?: string | null): Category {
  const exact = Category.options.filter((c) =>
    CATEGORY_LOST112_CODES[c].some((x) => x.prdtCl01 === prdtCl01 && x.prdtCl02 === (prdtCl02 ?? null)),
  );
  if (exact.length > 1) return "ETC";
  if (exact[0]) return exact[0];
  const whole = Category.options.find((c) =>
    CATEGORY_LOST112_CODES[c].some((x) => x.prdtCl01 === prdtCl01 && x.prdtCl02 === null),
  );
  return whole ?? "ETC";
}

/**
 * 연관 종류 묶음 (기능 명세서 F-07). 신고 종류로 후보를 찾을 때 함께 찾는 종류. 서로 대칭이다.
 * ETC는 모든 종류와 묶이므로 아래 relatedCategories()에서 따로 처리한다.
 */
const RELATED_PAIRS: [Category, Category][] = [
  ["WALLET", "ID_CARD"],
  ["WALLET", "DRIVER_LICENSE"],
  ["WALLET", "PAYMENT_CARD"],
  ["WALLET", "TRANSIT_CARD"],
  ["WALLET", "OTHER_CARD"],
  ["WALLET", "CASH"],
  ["ID_CARD", "DRIVER_LICENSE"],
  ["PAYMENT_CARD", "TRANSIT_CARD"],
  ["PAYMENT_CARD", "OTHER_CARD"],
  ["TRANSIT_CARD", "OTHER_CARD"],
  ["ID_CARD", "OTHER_CARD"],
  ["LAPTOP", "TABLET"],
  ["LAPTOP", "CHARGER"],
  ["TABLET", "CHARGER"],
  ["PHONE", "CHARGER"],
  ["EARPHONE", "CHARGER"],
  ["SMARTWATCH", "CHARGER"],
  ["SMARTWATCH", "ACCESSORY"],
  ["BAG", "CLOTHING"],
  ["CLOTHING", "HAT"],
  ["BOOK", "STATIONERY"],
];

export const RELATED_CATEGORIES: Partial<Record<Category, Category[]>> = Object.fromEntries(
  Category.options
    .map((c) => [c, RELATED_PAIRS.flatMap(([a, b]) => (a === c ? [b] : b === c ? [a] : []))] as const)
    .filter(([, list]) => list.length > 0),
);

/**
 * 세부 종류까지 봐야 하는 연관 묶음 (기능 명세서 F-07). [신고 종류, 신고 세부 종류(null이면 상관없음), 습득 종류, 습득 세부 종류]
 * 동전지갑은 사진으로 파우치처럼 보여 AI가 가방 > 파우치로 분류하기도 한다 (실제 사진 35장 평가, 10/30).
 * 가방 전체가 아니라 파우치만 묶어 배낭·에코백이 지갑 신고에 섞이지 않게 한다. 서로 대칭이다.
 */
const RELATED_SUB_PAIRS: [Category, string | null, Category, string][] = [["WALLET", null, "BAG", "POUCH"]];

/** 세부 종류 기준으로 연관 종류인지 (같은 종류·RELATED_CATEGORIES는 따로 본다) */
export function relatedBySubCategory(
  reported: Category,
  reportedSub: string | null,
  item: Category | null,
  itemSub: string | null,
): boolean {
  return RELATED_SUB_PAIRS.some(
    ([a, aSub, b, bSub]) =>
      (reported === a && (aSub === null || reportedSub === aSub) && item === b && itemSub === bSub) ||
      (reported === b && reportedSub === bSub && item === a && (aSub === null || itemSub === aSub)),
  );
}

/**
 * 연관 종류라도 세부 종류끼리 관계없으면 후보에서 뺀다. [종류 A, 종류 B, B의 세부 종류 중 A와 관계있는 것만]. 서로 대칭이다.
 * 무선 이어폰 신고에 마우스가 후보로 뜨던 문제 (기획 피드백 10/31). 이어폰과 충전기를 묶은 건 이어폰 케이스가
 * 충전기로 분류되는 경우 때문이라, 충전기 중 케이블·보조배터리만 남긴다.
 * 양쪽 세부 종류가 다 정해졌을 때만 뺀다. 세부 종류가 없는 종류(휴대폰·스마트워치·모자)는 그 자체로 정해진 것으로 본다.
 */
const RELATED_SUB_ONLY: [Category, Category, readonly SubCategory[]][] = [
  ["EARPHONE", "CHARGER", ["CABLE_CHARGER", "POWER_BANK"]],
  ["PHONE", "CHARGER", ["CABLE_CHARGER", "POWER_BANK"]],
  ["SMARTWATCH", "CHARGER", ["CABLE_CHARGER", "POWER_BANK"]],
  ["BAG", "CLOTHING", ["OUTER", "TOP", "BOTTOM", "SCARF_GLOVES"]],
  ["HAT", "CLOTHING", ["OUTER", "TOP", "BOTTOM", "SCARF_GLOVES"]],
];

/** 세부 종류가 정해졌는지. 세부 종류가 없는 종류는 종류만으로 정해진 것으로 본다 */
function subKnown(category: Category, sub: string | null): boolean {
  return sub !== null || SUB_CATEGORIES[category] === undefined;
}

/** 연관 종류지만 세부 종류끼리 관계없어 후보에서 뺄 조합인지 (RELATED_SUB_ONLY) */
export function unrelatedBySubCategory(
  reported: Category,
  reportedSub: string | null,
  item: Category | null,
  itemSub: string | null,
): boolean {
  if (!item || !subKnown(reported, reportedSub) || !subKnown(item, itemSub)) return false;
  return RELATED_SUB_ONLY.some(
    ([a, b, allowed]) =>
      (reported === a && item === b && !(allowed as readonly string[]).includes(itemSub as string)) ||
      (reported === b && item === a && !(allowed as readonly string[]).includes(reportedSub as string)),
  );
}

/** 후보 검색에서 세부 종류 묶음으로 더 볼 종류·세부 종류 (신고 세부 종류를 모르면 세부 종류가 필요한 쪽은 넣지 않는다) */
export function relatedSubCategoryTargets(
  reported: Category,
  reportedSub: string | null,
): { category: Category; subCategory: string | null }[] {
  return RELATED_SUB_PAIRS.flatMap(([a, aSub, b, bSub]) => {
    if (reported === a && (aSub === null || reportedSub === aSub)) return [{ category: b, subCategory: bSub }];
    if (reported === b && reportedSub === bSub) return [{ category: a, subCategory: aSub }];
    return [];
  });
}

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
  // 실제 사진 35장 평가(10/30)에서 진짜 주인이 떨어진 이웃 색: 베이지(노랑↔갈색), 코랄(주황↔분홍), 남색(파랑↔검정)
  ["YELLOW", "BROWN"],
  ["ORANGE_CORAL", "PINK_MAGENTA"],
  ["BLUE_TEAL", "BLACK"],
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

/**
 * 고가품 (open-issues #32, QA B11). 보관 방식은 보관처(센터·경비실)만 받고, 공개 화면에 대면 수령 안내를 붙인다.
 * 돈·신분·결제에 쓰이거나 비싼 전자기기·귀금속.
 */
export const VALUABLE_CATEGORIES: readonly Category[] = [
  "WALLET",
  "ID_CARD",
  "DRIVER_LICENSE",
  "PAYMENT_CARD",
  "PHONE",
  "EARPHONE",
  "SMARTWATCH",
  "TABLET",
  "LAPTOP",
  "ACCESSORY",
  "CASH",
];

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

/** NEED_MORE: 근거 부족(맞힌 특징도 모순도 없음). 실패로 세지 않는다 (10/31) */
export const MatchResult = z.enum(["PASS", "BORDERLINE", "FAIL", "NEED_MORE"]);
export type MatchResult = z.infer<typeof MatchResult>;

/** DEMO: 체험 계정의 수령. 시드 상태를 바꾸지 않고 "완료는 물건당 1건" 규칙에서도 빠진다. */
export const PickupMethod = z.enum(["CENTER_QR", "SELF_REPORT", "IN_PERSON", "DEMO"]);
export type PickupMethod = z.infer<typeof PickupMethod>;

export const PickupStatus = z.enum(["ISSUED", "COMPLETED", "EXPIRED"]);
export type PickupStatus = z.infer<typeof PickupStatus>;

export const NotificationType = z.enum([
  "NEW_CANDIDATE",
  "MULTI_REVEAL",
  "CLAIM_LOCKED",
  "SYSTEM",
  "ITEM_INCOMING",
  "PICKUP_SCHEDULED",
  "VALUABLE_IN_PLACE",
]);
export type NotificationType = z.infer<typeof NotificationType>;

/**
 * 관리자 알림 구분 (QA 10/30 3차). 확인 필요: 사람이 판단해야 하는 일(잠금, 여러 계정 열람, 반복 분실 높음).
 * 정보: 할 일 없이 알아 두면 되는 일(맡긴 물건 등록, 수령 예정). 그 자리에 둔 귀중품은 회수를 판단해야 해서 확인 필요. 확인 통과 자체는 분실자 개인 활동이라 알리지 않는다.
 */
export const NOTIFICATION_KIND: Record<NotificationType, "ACTION" | "INFO"> = {
  NEW_CANDIDATE: "INFO",
  MULTI_REVEAL: "ACTION",
  CLAIM_LOCKED: "ACTION",
  SYSTEM: "ACTION",
  ITEM_INCOMING: "INFO",
  PICKUP_SCHEDULED: "INFO",
  VALUABLE_IN_PLACE: "ACTION",
};

export const ClosedReason = z.enum(["DISPOSED", "MISREGISTERED"]);
export type ClosedReason = z.infer<typeof ClosedReason>;
export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
  DISPOSED: "폐기·이관",
  MISREGISTERED: "잘못 등록",
};

/** 층 글자: -1 → "지하 1층", 2 → "2층", 모르면 "". 화면마다 다르게 쓰던 것을 맞춘다 (QA 10/30 3차) */
export function floorLabel(floor: number | null | undefined): string {
  if (floor === null || floor === undefined) return "";
  return floor < 0 ? `지하 ${-floor}층` : `${floor}층`;
}
