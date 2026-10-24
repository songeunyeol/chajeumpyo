// 개발용 더미 데이터: 건물 6·보관처 3·관리자 2·습득물 7 (실제 5 + 체험용 시드 2).
// 개발 DB(또는 e2e DB)에만 넣는다. 여러 번 돌려도 건물·보관처·관리자는 덮어쓰고, 습득물은 이미 있으면 건너뛴다.
// 습득물은 실제 API로 등록하므로 API 서버가 켜져 있어야 한다:
//   npm run seed:dev -w backend            (PORT의 API, 기본 4000)
//   PORT=4100 npm run seed:dev -w backend  (4100에 띄운 API)
// 습득 시각은 지금 기준 최근(체험 시드·실제 이어폰은 오늘)이라 분실 신고 "오늘"에 후보로 잡힌다 (scripts/seed-dates.ts).
// 날짜만 다시 최근으로: npm run seed:dev -w backend -- --refresh-dates
//   이미 넣은 더미 습득물(아직 보관 중인 것)의 found_at·expires_at만 고친다. 지우거나 새로 넣지 않고, API 서버도 필요 없다.
// 관리자: center@skuniv.ac.kr / guard@skuniv.ac.kr, 비밀번호 admin1234!
import { CONSENT_VERSION } from "@chajeumpyo/shared";
import sharp from "sharp";

// 개발 DB 전용: production이거나 테스트 DB(테스트가 비우고 채운다)면 멈춘다
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (process.env.NODE_ENV === "production" || dbName.endsWith("_test")) {
  throw new Error(`개발용 더미 데이터는 개발 DB에만 넣어요. (NODE_ENV=${process.env.NODE_ENV}, DB=${dbName})`);
}
// DB에 닿는 모듈은 확인을 마친 뒤에 불러온다 (정적 import는 위 확인보다 먼저 실행되므로)
const { hashPassword } = await import("../src/lib/hash");
const { prisma } = await import("../src/lib/prisma");
const { uploaderFingerprint } = await import("../src/services/found-items");
const { SAMPLE_AGES, seedDates } = await import("./seed-dates");
const RETENTION_DAYS = Number(process.env.FOUND_ITEM_RETENTION_DAYS ?? 30);
const API = process.env.SEED_API_BASE ?? `http://localhost:${process.env.PORT ?? 4000}/api/v1`;

// 1) 건물·보관처·관리자 ------------------------------------------------------
const C = { lat: 37.6148855, lng: 127.0133508 }; // 캠퍼스 중심. 건물 좌표는 임의 값
const buildings: [string, number, number][] = [
  ["유담관", 0.0006, -0.0004],
  ["청운관", -0.0003, 0.0005],
  ["북악관", 0.0002, 0.0009],
  ["혜인관", -0.0007, -0.0002],
  ["본관", 0.0009, 0.0003],
  ["한림관", -0.0004, -0.0009],
];
for (const [i, [name, dl, dg]] of buildings.entries()) {
  const data = { name, lat: C.lat + dl, lng: C.lng + dg, sortOrder: i };
  await prisma.building.upsert({ where: { name }, update: data, create: data });
}
const bid = async (name: string) => (await prisma.building.findUniqueOrThrow({ where: { name } })).id;

const places: [string, string, "CENTER" | "GUARD", string][] = [
  ["종합서비스센터", "청운관", "CENTER", "청운관 3층 학생과 옆 종합서비스센터 (평일 9~18시)"],
  ["유담관 경비실", "유담관", "GUARD", "유담관 1층 정문 경비실"],
  ["북악관 경비실", "북악관", "GUARD", "북악관 1층 경비실"],
];
for (const [name, bld, org, guideText] of places) {
  const data = { name, buildingId: await bid(bld), org, guideText };
  await prisma.storagePlace.upsert({ where: { name }, update: data, create: data });
}
const pid = async (name: string) => (await prisma.storagePlace.findUniqueOrThrow({ where: { name } })).id;

for (const [email, place] of [
  ["center@skuniv.ac.kr", "종합서비스센터"],
  ["guard@skuniv.ac.kr", "유담관 경비실"],
] as const) {
  const data = {
    email,
    passwordHash: await hashPassword("admin1234!"),
    role: "ADMIN" as const,
    storagePlaceId: await pid(place),
  };
  await prisma.user.upsert({ where: { email }, update: data, create: data });
}

// 2) 습득물: API로 등록(가짜 AI는 늘 이어폰) → 관리자 수정으로 속성 바꾸기 --------------------
// 더미 습득물은 User-Agent "seed-<순서>"로 등록해서, 등록자 지문으로 순서를 되찾는다 (로컬에서 돌리므로 IP는 루프백)
const SEED_UA = (i: number) => `seed-${i}`;
const seedIndexByFingerprint = new Map<string, number>();
for (const ip of ["::1", "::ffff:127.0.0.1", "127.0.0.1"]) {
  for (let i = 0; i < SAMPLE_AGES.length; i++) seedIndexByFingerprint.set(uploaderFingerprint(ip, SEED_UA(i)), i);
}

if (process.argv.includes("--refresh-dates")) {
  const now = new Date();
  const items = await prisma.foundItem.findMany({
    where: {
      uploaderFingerprint: { in: [...seedIndexByFingerprint.keys()] },
      dataPurgedAt: null,
      status: { in: ["REGISTERED", "REVEALED"] },
    },
    select: { id: true, uploaderFingerprint: true },
  });
  for (const item of items) {
    const i = seedIndexByFingerprint.get(item.uploaderFingerprint ?? "") as number;
    await prisma.foundItem.update({ where: { id: item.id }, data: seedDates(i, now, RETENTION_DAYS) });
  }
  console.log(`더미 습득물 ${items.length}개의 습득 시각을 지금 기준으로 고쳤어요.`);
  await prisma.$disconnect();
  process.exit(0);
}

if ((await prisma.foundItem.count()) > 0) {
  console.log("습득물이 이미 있어 건너뛰어요. (건물·보관처·관리자는 갱신함)");
  await prisma.$disconnect();
  process.exit(0);
}

const login = await fetch(`${API}/admin/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "center@skuniv.ac.kr", password: "admin1234!" }),
});
if (!login.ok) throw new Error(`관리자 로그인 실패 ${login.status}. API 서버(${API})가 켜져 있나요?`);
const adminToken = ((await login.json()) as { accessToken: string }).accessToken;

type Sample = {
  building: string;
  floor: number;
  place?: string;
  rgb: [number, number, number];
  seed?: boolean;
  patch?: Record<string, unknown>;
};
const samples: Sample[] = [
  { building: "유담관", floor: 7, place: "유담관 경비실", rgb: [235, 235, 235] }, // 가짜 AI 그대로: 흰 이어폰, 곰돌이 스티커
  {
    building: "청운관",
    floor: 1,
    rgb: [30, 30, 30],
    patch: {
      category: "UMBRELLA",
      categoryAlt: null,
      color: "BLACK",
      brand: null,
      features: [
        { key: "pattern", value: "회색 체크무늬" },
        { key: "keyring", value: "고양이 키링" },
      ],
      description: "검정 장우산, 회색 체크무늬, 손잡이에 고양이 키링",
      title: "검정 체크무늬 우산, 고양이 키링",
    },
  },
  {
    building: "북악관",
    floor: -1,
    place: "북악관 경비실",
    rgb: [120, 80, 40],
    patch: {
      category: "WALLET",
      categoryAlt: "ID_CARD",
      color: "BROWN",
      brand: "MCM",
      features: [
        { key: "contents", value: "티머니 교통카드" },
        { key: "text", value: "안쪽에 J.H 각인" },
      ],
      description: "갈색 MCM 반지갑, 안에 교통카드, 안쪽에 J.H 각인",
      title: "갈색 MCM 반지갑 (J.H 각인)",
    },
  },
  {
    building: "혜인관",
    floor: 3,
    rgb: [40, 110, 200],
    patch: {
      category: "TUMBLER",
      categoryAlt: null,
      color: "BLUE_TEAL",
      brand: "스탠리",
      features: [
        { key: "sticker", value: "펭귄 스티커" },
        { key: "scratch", value: "바닥 찌그러짐" },
      ],
      description: "파란 스탠리 텀블러, 펭귄 스티커, 바닥이 찌그러짐",
      title: "파란 스탠리 텀블러, 펭귄 스티커",
    },
  },
  {
    building: "유담관",
    floor: 9,
    place: "종합서비스센터",
    rgb: [200, 60, 60],
    patch: {
      category: "KEY",
      categoryAlt: null,
      color: "RED",
      brand: "현대",
      features: [
        { key: "keyring", value: "빨간 하트 키링" },
        { key: "case", value: "가죽 키케이스" },
      ],
      description: "현대 자동차 스마트키, 빨간 하트 키링, 가죽 키케이스",
      title: "현대 스마트키, 빨간 하트 키링",
    },
  },
  // 체험 계정은 시드만 본다
  { building: "유담관", floor: 8, place: "유담관 경비실", rgb: [230, 230, 230], seed: true },
  {
    building: "청운관",
    floor: 1,
    place: "종합서비스센터",
    rgb: [20, 20, 20],
    seed: true,
    patch: {
      category: "PHONE",
      categoryAlt: null,
      color: "BLACK",
      brand: "Apple",
      features: [
        { key: "case", value: "투명 케이스" },
        { key: "sticker", value: "케이스 안 네컷 사진" },
      ],
      description: "검정 아이폰, 투명 케이스, 케이스 안에 네컷 사진",
      title: "검정 아이폰, 투명 케이스",
    },
  },
];

const photo = (rgb: [number, number, number]) =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="640" height="480"><circle cx="320" cy="240" r="140" fill="rgb(${255 - rgb[0]},${255 - rgb[1]},${255 - rgb[2]})" opacity="0.5"/></svg>`,
        ),
      },
    ])
    .jpeg()
    .toBuffer();

if (samples.length !== SAMPLE_AGES.length) throw new Error("samples와 seed-dates.ts SAMPLE_AGES 개수가 달라요");
const seededAt = new Date();
for (const [i, s] of samples.entries()) {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(await photo(s.rgb))], { type: "image/jpeg" }), "sample.jpg");
  form.append("buildingId", String(await bid(s.building)));
  form.append("storageType", s.place ? "HANDED_OVER" : "IN_PLACE");
  if (s.place) form.append("storagePlaceId", String(await pid(s.place)));
  form.append("floor", String(s.floor));
  form.append("consentVersion", CONSENT_VERSION);
  form.append("consentExternalAi", "true");
  form.append("consentLocation", "false");
  const res = await fetch(`${API}/found-items`, { method: "POST", body: form, headers: { "User-Agent": SEED_UA(i) } });
  if (!res.ok) throw new Error(`등록 실패 ${res.status} ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  if (s.patch) {
    const p = await fetch(`${API}/admin/found-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(s.patch),
    });
    if (!p.ok) throw new Error(`속성 수정 실패 ${p.status} ${await p.text()}`);
  }
  await prisma.foundItem.update({
    where: { id },
    data: { ...seedDates(i, seededAt, RETENTION_DAYS), ...(s.seed ? { isSeed: true } : {}) },
  });
}

console.log(`건물 ${buildings.length}, 보관처 ${places.length}, 관리자 2, 습득물 ${samples.length}개를 넣었어요.`);
await prisma.$disconnect();
