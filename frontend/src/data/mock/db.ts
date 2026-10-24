import type {
  AdminFoundItemDetailResponse,
  BuildingListItem,
  Candidate,
  Category,
  FoundItemDetailResponse,
  HotspotResponse,
  LostReportListResponse,
  NotificationItem,
  StoragePlaceItem,
} from "@chajeumpyo/shared";

/**
 * 화면 확인용 가짜 데이터. 실제 API가 붙으면 쓰지 않는다 (VITE_USE_MOCKS=true일 때만).
 * 좌표는 캠퍼스 중심(37.6148855, 127.0133508) 주변의 임시값이다.
 */

const C = { lat: 37.6148855, lng: 127.0133508 };
const at = (dLat: number, dLng: number) => ({ lat: C.lat + dLat, lng: C.lng + dLng });

export const buildings: BuildingListItem[] = [
  { id: 1, name: "유담관", ...at(0.0004, -0.0006) },
  { id: 2, name: "청운관", ...at(-0.0003, 0.0002) },
  { id: 3, name: "북악관", ...at(0.0008, 0.0005) },
  { id: 4, name: "혜인관", ...at(-0.0007, -0.0004) },
  { id: 5, name: "본관", ...at(0.0001, 0.0009) },
  { id: 6, name: "한림관", ...at(-0.001, 0.0008) },
  { id: 7, name: "은주관", ...at(0.0012, -0.0011) },
  { id: 8, name: "대일관", ...at(-0.0013, -0.001) },
  { id: 9, name: "상승관", ...at(0.0015, 0.0012) },
  { id: 10, name: "수인관", ...at(-0.0016, 0.0015) },
  { id: 11, name: "문예관", ...at(0.0002, -0.0016) },
];

const b = (id: number) => {
  const x = buildings.find((y) => y.id === id) ?? buildings[0];
  return { id: x?.id ?? 1, name: x?.name ?? "유담관" };
};

export const storagePlaces: Omit<StoragePlaceItem, "sameBuilding">[] = [
  {
    id: 1,
    name: "학생지원센터",
    building: b(2),
    org: "CENTER",
    guideText: "청운관 3층 학생과 옆. 평일 9시~18시에 맡기고 찾을 수 있어요.",
  },
  { id: 2, name: "유담관 경비실", building: b(1), org: "GUARD", guideText: "유담관 1층 정문 옆. 24시간 운영해요." },
  { id: 3, name: "북악관 경비실", building: b(3), org: "GUARD", guideText: "북악관 1층 로비. 평일 7시~22시." },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** 사진 자리 (단색 도형 SVG) */
export function mockPhoto(fill: string, shape: "rect" | "circle" = "rect"): string {
  const body =
    shape === "circle"
      ? `<circle cx="160" cy="130" r="70" fill="${fill}"/>`
      : `<rect x="70" y="70" width="180" height="120" rx="18" fill="${fill}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="260" viewBox="0 0 320 260"><rect width="320" height="260" fill="#CFC8BB"/>${body}<rect x="200" y="90" width="26" height="26" rx="13" fill="#F4D35E"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 가짜 판정 결과. 후보 id로 고른다 */
export type MockOutcome = "PASS" | "BORDERLINE" | "FAIL" | "IN_PERSON" | "LOCKED";

type MockFound = {
  candidate: Candidate;
  outcome: MockOutcome;
  detail: Omit<FoundItemDetailResponse, "id" | "category" | "building" | "foundAt" | "isSeed">;
  title: string;
};

const mkCand = (
  id: string,
  category: Category,
  buildingId: number,
  floor: number | null,
  h: number,
  extra: Partial<Candidate>,
): Candidate => ({
  foundItemId: id,
  category,
  foundAt: hoursAgo(h),
  building: b(buildingId),
  floor,
  thumbnailUrl: mockPhoto("#F2F0EA", "circle"),
  reasons: ["SAME_CATEGORY", "SAME_BUILDING"],
  attemptsLeft: 3,
  locked: false,
  inPersonOnly: false,
  isSeed: true,
  ...extra,
});

const expires = () => new Date(Date.now() + 10 * 60_000).toISOString();

export const foundItems: Record<string, MockFound> = {
  "11111111-1111-4111-8111-111111111111": {
    candidate: mkCand("11111111-1111-4111-8111-111111111111", "EARPHONE", 1, 7, 2, {
      reasons: ["SAME_CATEGORY", "SAME_BUILDING", "FOUND_SOON_AFTER"],
    }),
    outcome: "PASS",
    title: "흰색 무선 이어폰, 곰돌이 스티커",
    detail: {
      color: "흰색",
      imageUrl: mockPhoto("#F7F7F2", "circle"),
      imageUrlExpiresAt: expires(),
      storageType: "HANDED_OVER",
      storagePlace: { id: 1, name: "학생지원센터", guideText: storagePlaces[0]?.guideText ?? "" },
      status: "REGISTERED",
      pickupNotice: "고가품이라 보관처에서 학생증을 보여 주고 받아 가요.",
    },
  },
  "22222222-2222-4222-8222-222222222222": {
    candidate: mkCand("22222222-2222-4222-8222-222222222222", "UMBRELLA", 2, 1, 20, {
      reasons: ["SAME_CATEGORY"],
      attemptsLeft: 2,
    }),
    outcome: "BORDERLINE",
    title: "남색 장우산, 나무 손잡이",
    detail: {
      color: "파랑·청록",
      imageUrl: mockPhoto("#2E3D8C"),
      imageUrlExpiresAt: expires(),
      storageType: "IN_PLACE",
      storagePlace: null,
      status: "REGISTERED",
      pickupNotice: null,
    },
  },
  "33333333-3333-4333-8333-333333333333": {
    candidate: mkCand("33333333-3333-4333-8333-333333333333", "WALLET", 3, -1, 30, {
      reasons: ["RELATED_CATEGORY", "SAME_BUILDING"],
      attemptsLeft: 0,
      locked: true,
      inPersonOnly: true,
      isSeed: false,
    }),
    outcome: "IN_PERSON",
    title: "갈색 반지갑",
    detail: {
      color: "갈색",
      imageUrl: mockPhoto("#7A5230"),
      imageUrlExpiresAt: expires(),
      storageType: "HANDED_OVER",
      storagePlace: { id: 3, name: "북악관 경비실", guideText: storagePlaces[2]?.guideText ?? "" },
      status: "REGISTERED",
      pickupNotice: null,
    },
  },
  "44444444-4444-4444-8444-444444444444": {
    candidate: mkCand("44444444-4444-4444-8444-444444444444", "PHONE", 4, 2, 5, { attemptsLeft: 2 }),
    outcome: "FAIL",
    title: "검정 휴대폰, 투명 케이스",
    detail: {
      color: "검정",
      imageUrl: mockPhoto("#1C1F1D"),
      imageUrlExpiresAt: expires(),
      storageType: "HANDED_OVER",
      storagePlace: { id: 1, name: "학생지원센터", guideText: storagePlaces[0]?.guideText ?? "" },
      status: "REGISTERED",
      pickupNotice: "고가품이라 보관처에서 학생증을 보여 주고 받아 가요.",
    },
  },
  "55555555-5555-4555-8555-555555555555": {
    candidate: mkCand("55555555-5555-4555-8555-555555555555", "PHONE", 4, 3, 26, {
      reasons: ["SAME_CATEGORY"],
      thumbnailUrl: null,
      attemptsLeft: 0,
      locked: true,
    }),
    outcome: "LOCKED",
    title: "흰색 휴대폰",
    detail: {
      color: "흰색",
      imageUrl: mockPhoto("#FFFFFF"),
      imageUrlExpiresAt: expires(),
      storageType: "IN_PLACE",
      storagePlace: null,
      status: "REGISTERED",
      pickupNotice: null,
    },
  },
};

export const reportCandidates: Record<string, string[]> = {
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ],
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": [
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ],
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc": [],
};

export const lostReports: LostReportListResponse["reports"] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    category: "EARPHONE",
    status: "OPEN",
    description: "흰색 무선 이어폰이에요. 케이스에 곰돌이 스티커가 붙어 있어요.",
    lostFrom: hoursAgo(6),
    lostTo: hoursAgo(3),
    building: b(1),
    candidateCount: 3,
    createdAt: hoursAgo(2.5),
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    category: "PHONE",
    status: "OPEN",
    description: "검정 휴대폰, 뒷면에 학교 스티커가 있어요.",
    lostFrom: hoursAgo(30),
    lostTo: hoursAgo(26),
    building: b(4),
    candidateCount: 2,
    createdAt: hoursAgo(25),
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    category: "BOOK",
    status: "CLOSED",
    description: "경영학원론 교재, 이름 적혀 있음",
    lostFrom: hoursAgo(200),
    lostTo: hoursAgo(190),
    building: null,
    candidateCount: 0,
    createdAt: hoursAgo(188),
  },
];

export const notifications: NotificationItem[] = [
  {
    id: "n1000000-0000-4000-8000-000000000001",
    type: "NEW_CANDIDATE",
    message: "유담관에서 무선 이어폰 후보가 새로 등록됐어요.",
    foundItemId: "11111111-1111-4111-8111-111111111111",
    lostReportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    readAt: null,
    createdAt: hoursAgo(0.3),
  },
  {
    id: "n1000000-0000-4000-8000-000000000002",
    type: "CLAIM_LOCKED",
    message: "휴대폰 후보는 확인 횟수를 모두 써서 더 확인할 수 없어요.",
    foundItemId: "55555555-5555-4555-8555-555555555555",
    lostReportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    readAt: null,
    createdAt: hoursAgo(5),
  },
  {
    id: "n1000000-0000-4000-8000-000000000003",
    type: "SYSTEM",
    message: "찾음표에 오신 걸 환영해요. 분실 신고를 올리면 후보가 생길 때 알려 드려요.",
    foundItemId: null,
    lostReportId: null,
    readAt: hoursAgo(20),
    createdAt: hoursAgo(26),
  },
];

export function adminDetail(id: string): AdminFoundItemDetailResponse {
  const f = foundItems[id] ?? foundItems["11111111-1111-4111-8111-111111111111"];
  if (!f) throw new Error("mock missing");
  const c = f.candidate;
  return {
    id,
    status: id.startsWith("4") ? "CLAIMED" : id.startsWith("2") ? "REVEALED" : "REGISTERED",
    category: c.category,
    title: f.title,
    building: c.building,
    floor: c.floor,
    storageType: f.detail.storageType,
    storagePlace: f.detail.storagePlace,
    foundAt: c.foundAt,
    isSeed: c.isSeed,
    claimLockedAt: c.inPersonOnly ? hoursAgo(3) : null,
    categoryAlt: null,
    color: "WHITE",
    brand: c.category === "EARPHONE" ? "Apple" : null,
    features: [{ key: "sticker", value: "곰돌이 스티커" }],
    description: `${f.title}. 케이스 모서리에 작은 흠집이 있어요.`,
    isSensitive: false,
    originalImageUrl: f.detail.imageUrl,
    // 공개본은 원본과 다른 그림으로 둬서 목록이 원본을 쓰지 않는지 화면·테스트로 가릴 수 있게
    publicImageUrl: mockPhoto("#D9D2C5"),
    thumbnailUrl: c.thumbnailUrl,
    expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    attempts: [
      { emailMasked: "ki***@skuniv.ac.kr", result: "FAIL", answerCorrect: null, createdAt: hoursAgo(4) },
      { emailMasked: "le***@skuniv.ac.kr", result: "BORDERLINE", answerCorrect: false, createdAt: hoursAgo(3) },
    ],
    reveals: id.startsWith("3")
      ? [
          { emailMasked: "kj***@skuniv.ac.kr", revealedAt: hoursAgo(30) },
          { emailMasked: "mh***@skuniv.ac.kr", revealedAt: hoursAgo(26) },
        ]
      : [],
    pickups: id.startsWith("4")
      ? [
          {
            id: "p-done",
            emailMasked: "kj***@skuniv.ac.kr",
            method: "CENTER_QR",
            status: "COMPLETED",
            completedAt: hoursAgo(2),
            createdAt: hoursAgo(5),
            processedByEmailMasked: "ce***@skuniv.ac.kr",
            verificationNote: null,
          },
        ]
      : [],
  };
}

export const reviewItem: AdminFoundItemDetailResponse = {
  ...adminDetail("22222222-2222-4222-8222-222222222222"),
  id: "66666666-6666-4666-8666-666666666666",
  status: "REVIEW",
  category: null,
  title: null,
  color: null,
  brand: null,
  features: [],
  description: null,
  isSeed: false,
  attempts: [],
};

export const hotspots: HotspotResponse = {
  from: new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
  to: new Date().toISOString().slice(0, 10),
  isSeedData: true,
  total: 128,
  byBuilding: [
    { building: "유담관", count: 41 },
    { building: "청운관", count: 33 },
    { building: "북악관", count: 22 },
    { building: "혜인관", count: 14 },
    { building: "본관", count: 9 },
    { building: "한림관", count: 9 },
  ],
  byHour: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hour < 8 ? 0 : Math.round(12 * Math.exp(-((hour - 13) ** 2) / 10)) + (hour === 18 ? 4 : 0),
  })),
  byCategory: [
    { category: "EARPHONE", count: 27 },
    { category: "ID_CARD", count: 21 },
    { category: "UMBRELLA", count: 18 },
    { category: "WALLET", count: 14 },
    { category: "TUMBLER", count: 12 },
    { category: "BOOK", count: 9 },
  ],
  topInsight: "유담관 7~8층(도서관)에서 오후 1시 전후로 무선 이어폰 분실이 가장 많아요.",
};
