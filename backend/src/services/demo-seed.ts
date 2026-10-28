import {
  type AiFeature,
  type Category,
  CONSENT_VERSION,
  type Color,
  type SubCategory,
  subCategoryWithin,
} from "@chajeumpyo/shared";
import sharp from "sharp";
import { ai } from "../ai";
import { makePublicImage, makeThumbImage, normalizeImage } from "../lib/image";
import { prisma } from "../lib/prisma";
import { setFoundItemEmbedding } from "../repositories/embedding";
import { storage } from "../storage";
import { isValidEmbedding } from "./found-items";

// 심사위원 체험용 시드 습득물 (F-05). 체험 계정의 후보에만 나오고, 판정·열람·수령해도 상태가 바뀌지 않는다.
// 숨은 특징은 docs/demo-scenario.md에 적어 두었다. 여기 값을 바꾸면 그 문서도 같이 고친다.
// 사진은 실제 사진·사람·학번·카드 번호 없이 SVG로 그린 그림이다.

type DemoSeedItem = {
  /** 고정 id. 다시 돌려도 같은 행을 고친다(중복 없음) */
  id: string;
  building: string;
  floor: number;
  /** 보관처 이름 (prisma/seed-data/storage-places.json). 없으면 그 자리에 둠 */
  storagePlace?: string;
  locationDetail: string;
  /** 지금부터 몇 시간 전에 주웠는지. "오늘 잃어버렸어요" 신고의 후보에 잡히도록 짧게 둔다 */
  hoursAgo: number;
  category: Category;
  subCategory: SubCategory | null;
  color: Color;
  brand: string | null;
  features: AiFeature[];
  description: string;
  title: string;
  svg: string;
};

const W = 800;
const H = 600;
/** 책상 위에 놓인 느낌의 배경과 그림자. 물건 그림만 바꿔 끼운다 */
const scene = (body: string, bg = "#e9e2d6") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect y="430" width="${W}" height="170" fill="#ddd3c4"/>
  <ellipse cx="400" cy="470" rx="230" ry="26" fill="rgba(0,0,0,0.12)"/>
  ${body}
</svg>`;

export const DEMO_SEED_ITEMS: DemoSeedItem[] = [
  {
    id: "5eed0000-0000-4000-8000-000000000001",
    building: "혜인관",
    floor: 3,
    storagePlace: "종합서비스센터",
    locationDetail: "3층 엘리베이터 앞 벤치 위",
    hoursAgo: 1,
    category: "EARPHONE",
    subCategory: "WIRELESS_EARBUDS",
    color: "WHITE",
    brand: "Apple",
    features: [
      { key: "sticker", value: "곰돌이 스티커" },
      { key: "scratch", value: "케이스 뒷면 긁힘" },
    ],
    description: "흰색 무선 이어폰 케이스, 앞면에 곰돌이 스티커, 뒷면에 긁힌 자국",
    title: "흰색 무선 이어폰, 곰돌이 스티커",
    svg: scene(`
      <rect x="300" y="250" width="200" height="200" rx="70" fill="#fbfbf8" stroke="#cfc7b9" stroke-width="4"/>
      <line x1="304" y1="320" x2="496" y2="320" stroke="#ddd6ca" stroke-width="4"/>
      <circle cx="400" cy="385" r="34" fill="#b9845a"/>
      <circle cx="374" cy="356" r="13" fill="#b9845a"/><circle cx="426" cy="356" r="13" fill="#b9845a"/>
      <circle cx="389" cy="380" r="4" fill="#3a2a1d"/><circle cx="411" cy="380" r="4" fill="#3a2a1d"/>
      <ellipse cx="400" cy="396" rx="10" ry="7" fill="#e6c9a8"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000002",
    building: "북악관",
    floor: 1,
    storagePlace: "종합서비스센터",
    locationDetail: "1층 학생 라운지 소파 틈",
    hoursAgo: 2,
    category: "WALLET",
    subCategory: "BIFOLD_WALLET",
    color: "BROWN",
    brand: null,
    features: [
      { key: "text", value: "안쪽에 J.H 각인" },
      { key: "contents", value: "영화 티켓 한 장" },
    ],
    description: "갈색 가죽 반지갑, 안쪽에 J.H 각인, 영화 티켓 한 장이 들어 있음",
    title: "갈색 반지갑 (J.H 각인, 영화 티켓)",
    svg: scene(`
      <rect x="240" y="270" width="320" height="190" rx="18" fill="#8a5a35" stroke="#6b4426" stroke-width="5"/>
      <rect x="252" y="282" width="296" height="166" rx="12" fill="none" stroke="#a87650" stroke-width="3" stroke-dasharray="10 8"/>
      <rect x="430" y="240" width="110" height="60" rx="6" fill="#f0d36b" transform="rotate(-8 485 270)"/>
      <circle cx="455" cy="262" r="6" fill="#e9e2d6" transform="rotate(-8 485 270)"/>
      <line x1="400" y1="282" x2="400" y2="448" stroke="#6b4426" stroke-width="4"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000003",
    building: "청운관",
    floor: 1,
    locationDetail: "1층 정문 우산꽂이",
    hoursAgo: 3,
    category: "UMBRELLA",
    subCategory: null,
    color: "BLACK",
    brand: null,
    features: [
      { key: "pattern", value: "회색 체크무늬" },
      { key: "keyring", value: "고양이 키링" },
    ],
    description: "검정 장우산, 회색 체크무늬, 손잡이에 고양이 키링",
    title: "검정 체크무늬 우산, 고양이 키링",
    svg: scene(`
      <path d="M180 400 L560 250 L600 290 L230 450 Z" fill="#222"/>
      <path d="M260 368 L585 268 M330 340 L592 278 M220 420 L560 300 M280 430 L578 316" stroke="#777" stroke-width="5"/>
      <path d="M560 250 L640 220" stroke="#444" stroke-width="10" stroke-linecap="round"/>
      <path d="M220 440 q-40 30 -10 60" fill="none" stroke="#5a4636" stroke-width="16" stroke-linecap="round"/>
      <circle cx="205" cy="520" r="26" fill="#f1a65b"/>
      <path d="M186 502 l6 -20 l10 14 z M224 502 l-6 -20 l-10 14 z" fill="#f1a65b"/>
      <circle cx="197" cy="518" r="3.5" fill="#222"/><circle cx="213" cy="518" r="3.5" fill="#222"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000004",
    building: "유담관",
    floor: 5,
    locationDetail: "5층 강의실 창가 맨 뒷자리",
    hoursAgo: 4,
    category: "TUMBLER",
    subCategory: null,
    color: "BLUE_TEAL",
    brand: "스탠리",
    features: [
      { key: "sticker", value: "펭귄 스티커" },
      { key: "scratch", value: "바닥 찌그러짐" },
    ],
    description: "파란 스탠리 텀블러, 옆면에 펭귄 스티커, 바닥이 찌그러짐",
    title: "파란 스탠리 텀블러, 펭귄 스티커",
    svg: scene(`
      <rect x="320" y="150" width="160" height="300" rx="26" fill="#2f78b7"/>
      <rect x="310" y="130" width="180" height="40" rx="12" fill="#1f557f"/>
      <path d="M480 220 q70 10 60 90 q-8 50 -60 50" fill="none" stroke="#1f557f" stroke-width="18"/>
      <ellipse cx="400" cy="300" rx="38" ry="48" fill="#1b1b1b"/>
      <ellipse cx="400" cy="312" rx="26" ry="34" fill="#fafafa"/>
      <circle cx="388" cy="282" r="4" fill="#fafafa"/><circle cx="412" cy="282" r="4" fill="#fafafa"/>
      <path d="M393 294 l7 9 l7 -9 z" fill="#f2a33a"/>
      <path d="M330 440 q20 -18 40 0" fill="none" stroke="#1f557f" stroke-width="6"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000005",
    building: "청운관",
    floor: 2,
    storagePlace: "청운관 경비실",
    locationDetail: "2층 화장실 앞 정수기 위",
    hoursAgo: 5,
    category: "PHONE",
    subCategory: null,
    color: "BLACK",
    brand: "Apple",
    features: [
      { key: "case", value: "투명 케이스" },
      { key: "sticker", value: "케이스 안 별 스티커" },
    ],
    description: "검정 아이폰, 투명 케이스, 케이스 안쪽에 노란 별 스티커",
    title: "검정 아이폰, 투명 케이스, 별 스티커",
    svg: scene(`
      <rect x="300" y="130" width="200" height="340" rx="34" fill="rgba(220,235,245,0.55)" stroke="#b7c9d6" stroke-width="6"/>
      <rect x="312" y="142" width="176" height="316" rx="28" fill="#1c1c1e"/>
      <rect x="330" y="160" width="70" height="70" rx="18" fill="#2c2c2e"/>
      <circle cx="350" cy="182" r="12" fill="#0e0e10"/><circle cx="378" cy="208" r="12" fill="#0e0e10"/>
      <path d="M430 330 l12 26 l28 3 l-21 19 l6 28 l-25 -14 l-25 14 l6 -28 l-21 -19 l28 -3 z" fill="#f5c842"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000006",
    building: "유담관",
    floor: 1,
    storagePlace: "유담관 경비실",
    locationDetail: "1층 주차장 출입문 앞",
    hoursAgo: 6,
    category: "KEY",
    subCategory: "CAR_KEY",
    color: "BLACK",
    brand: "현대",
    features: [
      { key: "keyring", value: "빨간 하트 키링" },
      { key: "case", value: "갈색 가죽 키케이스" },
    ],
    description: "현대 자동차 스마트키, 갈색 가죽 키케이스, 빨간 하트 키링",
    title: "현대 스마트키, 빨간 하트 키링",
    svg: scene(`
      <rect x="330" y="230" width="140" height="210" rx="40" fill="#8b5b3a"/>
      <rect x="350" y="255" width="100" height="160" rx="30" fill="#222"/>
      <circle cx="400" cy="300" r="14" fill="#444"/><circle cx="400" cy="345" r="14" fill="#444"/>
      <circle cx="400" cy="390" r="14" fill="#444"/>
      <circle cx="400" cy="205" r="26" fill="none" stroke="#a9a9a9" stroke-width="7"/>
      <path d="M400 150 c-18 -26 -58 -6 -38 22 l38 34 l38 -34 c20 -28 -20 -48 -38 -22 z" fill="#d93a3a"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000007",
    building: "한림관",
    floor: 2,
    locationDetail: "2층 복사실 앞 의자 옆",
    hoursAgo: 7,
    category: "BAG",
    subCategory: "BACKPACK",
    color: "GRAY_SILVER",
    brand: null,
    features: [
      { key: "keyring", value: "노란 오리 인형 키링" },
      { key: "pattern", value: "앞주머니 별 자수" },
    ],
    description: "회색 백팩, 지퍼에 노란 오리 인형 키링, 앞주머니에 별 모양 자수",
    title: "회색 백팩, 오리 키링, 별 자수",
    svg: scene(`
      <rect x="270" y="130" width="260" height="330" rx="70" fill="#8e9297"/>
      <rect x="310" y="290" width="180" height="140" rx="30" fill="#7b7f84"/>
      <path d="M400 330 l9 20 l22 2 l-17 14 l5 21 l-19 -11 l-19 11 l5 -21 l-17 -14 l22 -2 z" fill="none" stroke="#e7e7e7" stroke-width="3"/>
      <path d="M330 180 q70 -70 140 0" fill="none" stroke="#6c7075" stroke-width="16"/>
      <line x1="320" y1="290" x2="480" y2="290" stroke="#5f6367" stroke-width="5"/>
      <ellipse cx="520" cy="340" rx="24" ry="20" fill="#f6d64a"/>
      <circle cx="520" cy="310" r="16" fill="#f6d64a"/>
      <path d="M532 310 l14 4 l-14 4 z" fill="#f08a2b"/><circle cx="524" cy="306" r="3" fill="#222"/>`),
  },
  {
    id: "5eed0000-0000-4000-8000-000000000008",
    building: "본관",
    floor: 4,
    locationDetail: "4층 열람실 입구 사물함 위",
    hoursAgo: 8,
    category: "STATIONERY",
    subCategory: "PENCIL_CASE",
    color: "PINK_MAGENTA",
    brand: null,
    features: [
      { key: "sticker", value: "딸기 스티커" },
      { key: "contents", value: "초록색 형광펜" },
    ],
    description: "분홍색 지퍼 필통, 앞에 딸기 스티커, 안에 초록색 형광펜",
    title: "분홍 필통, 딸기 스티커, 초록 형광펜",
    svg: scene(`
      <rect x="220" y="300" width="360" height="140" rx="60" fill="#e889ad"/>
      <path d="M250 330 L550 330" stroke="#c96b8f" stroke-width="6" stroke-dasharray="8 6"/>
      <rect x="520" y="318" width="34" height="22" rx="6" fill="#bdbdbd"/>
      <path d="M380 360 q20 -6 40 0 q0 50 -20 60 q-20 -10 -20 -60 z" fill="#e23a46"/>
      <path d="M385 358 q15 -16 30 0" fill="#3f9a4a"/>
      <circle cx="392" cy="375" r="2.5" fill="#ffe08a"/><circle cx="407" cy="380" r="2.5" fill="#ffe08a"/>
      <circle cx="398" cy="395" r="2.5" fill="#ffe08a"/>
      <rect x="430" y="270" width="150" height="26" rx="8" fill="#5fd068" transform="rotate(-12 505 283)"/>`),
  },
];

const keysOf = (id: string) => ({
  original: `found/${id}/original.jpg`,
  public: `found/${id}/public.jpg`,
  thumb: `found/${id}/thumb.jpg`,
});

/** 실제 등록과 같은 사진 처리(정리 → 공개본 → 후보용 블러본)를 거쳐 저장한다 */
async function putImages(item: DemoSeedItem) {
  const keys = keysOf(item.id);
  const original = await normalizeImage(await sharp(Buffer.from(item.svg)).png().toBuffer());
  const [publicImage, thumbImage] = await Promise.all([
    makePublicImage(original, { sensitive: false, regions: [] }),
    makeThumbImage(original),
  ]);
  // 같은 키에 덮어쓰므로 다시 돌려도 파일이 늘지 않는다. 배포로 디스크가 비었을 때도 이걸로 복구된다
  await storage.put(keys.original, original, "image/jpeg");
  await storage.put(keys.public, publicImage, "image/jpeg");
  await storage.put(keys.thumb, thumbImage, "image/jpeg");
  return keys;
}

const foundAtFor = (item: DemoSeedItem, now: Date) => new Date(now.getTime() - item.hoursAgo * 3600_000);

/**
 * 시드 습득물을 넣거나 고친다. 고정 id로 upsert하므로 여러 번 돌려도 개수가 늘지 않는다.
 * 매번 상태를 등록됨으로, 습득 시각을 지금 기준으로 되돌린다. 건물·보관처는 prisma/seed.ts가 먼저 넣어야 한다.
 */
export async function seedDemoItems(now = new Date()): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const item of DEMO_SEED_ITEMS) {
    const building = await prisma.building.findUnique({ where: { name: item.building } });
    if (!building) throw new Error(`건물 "${item.building}"이 없어요. npm run db:seed -w backend를 먼저 돌려 주세요.`);
    const place = item.storagePlace
      ? await prisma.storagePlace.findUnique({ where: { name: item.storagePlace } })
      : null;
    if (item.storagePlace && !place) {
      throw new Error(`보관처 "${item.storagePlace}"가 없어요. npm run db:seed -w backend를 먼저 돌려 주세요.`);
    }

    const embedding = await ai.embed(item.description);
    if (!isValidEmbedding(embedding)) throw new Error(`"${item.title}" 임베딩 형식이 틀려요.`);
    const keys = await putImages(item);

    const row = {
      buildingId: building.id,
      category: item.category,
      categoryAlt: null,
      subCategory: subCategoryWithin(item.category, item.subCategory),
      storageType: place ? ("HANDED_OVER" as const) : ("IN_PLACE" as const),
      storagePlaceId: place?.id ?? null,
      floor: item.floor,
      status: "REGISTERED" as const,
      isSeed: true,
      foundAt: foundAtFor(item, now),
      // 시드는 기한 만료·삭제 대상이 아니다 (data-purge.ts가 isSeed를 뺀다). 후보 검색도 null을 기한 없음으로 본다
      expiresAt: null,
      consentVersion: CONSENT_VERSION,
      locationConsent: false,
      dataPurgedAt: null,
      claimLockedAt: null,
      confirmTokenHash: null,
    };
    const detail = {
      imageOriginalKey: keys.original,
      imagePublicKey: keys.public,
      imageThumbKey: keys.thumb,
      isSensitive: false,
      color: item.color,
      brand: item.brand,
      features: item.features,
      description: item.description,
      title: item.title,
      locationDetail: item.locationDetail,
      rawAiResponse: { source: "seed-demo" },
    };

    await prisma.$transaction(async (tx) => {
      const exists = await tx.foundItem.findUnique({ where: { id: item.id }, select: { isSeed: true } });
      if (exists && !exists.isSeed) throw new Error(`id ${item.id}가 시드가 아닌 습득물이에요. 덮어쓰지 않아요.`);
      if (exists) {
        await tx.foundItem.update({
          where: { id: item.id },
          data: { ...row, detail: { upsert: { create: detail, update: detail } } },
        });
        updated++;
      } else {
        await tx.foundItem.create({ data: { id: item.id, ...row, detail: { create: detail } } });
        created++;
      }
      await setFoundItemEmbedding(item.id, embedding, tx);
    });
  }
  return { created, updated };
}

/**
 * 시드의 습득 시각만 지금 기준으로 다시 당긴다. 후보는 "분실 시작 이후에 주운 것"만 나오므로,
 * 며칠 지나면 "오늘 잃어버렸어요" 신고에 시드가 안 잡힌다. 정기 작업이 한 시간마다 부른다.
 */
export async function refreshDemoSeedDates(now = new Date()): Promise<number> {
  let count = 0;
  for (const item of DEMO_SEED_ITEMS) {
    const { count: n } = await prisma.foundItem.updateMany({
      where: { id: item.id, isSeed: true },
      data: { foundAt: foundAtFor(item, now) },
    });
    count += n;
  }
  return count;
}
