// F-01 습득물 등록, F-02 AI 속성 추출, F-03 개인정보 자동 블러: 이슈의 완료 기준 10개
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FoundItemExtraction } from "@chajeumpyo/shared";
import sharp from "sharp";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { EMBEDDING_DIM } from "../../src/ai/types";
import { createApp } from "../../src/app";
import { resetPremasker, setPremasker } from "../../src/privacy/premask";
import { storage } from "../../src/storage";
import { readLocalFile } from "../../src/storage/local";
import { finderConsentFields } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { jpegWithGpsAndRotation, noisyJpeg, sharpness, stripedJpeg } from "../helpers/images";

let app: ReturnType<typeof createApp>;
let buildingId: number;
let placeId: number;
let closedPlaceId: number;

const SENSITIVE: FoundItemExtraction = {
  hasObject: true,
  category: "ID_CARD",
  categoryAlt: "WALLET",
  color: "BLUE_TEAL",
  brand: null,
  features: [{ key: "text", value: "학생증 이름 홍길동" }],
  description: "파란 학생증",
  isSensitive: true,
  sensitiveRegions: [],
  title: "파란 학생증",
};

function useExtraction(result: FoundItemExtraction | (() => Promise<FoundItemExtraction>)) {
  setAiClient({ ...mockAiClient, extractFoundItem: typeof result === "function" ? result : async () => result });
}

async function register(fields: Record<string, string | number>, image?: Buffer, ua = "test-agent") {
  let req = request(app).post("/api/v1/found-items").set("User-Agent", ua);
  for (const [k, v] of Object.entries({ ...finderConsentFields(), ...fields })) req = req.field(k, String(v));
  if (image) req = req.attach("image", image, "photo.jpg");
  return req;
}

const inPlace = () => ({ buildingId, storageType: "IN_PLACE" });
/** 가짜 AI는 늘 이어폰(귀중품)이라 그 자리에 둠은 거절된다 (QA B11). 보관 방식이 주제가 아닌 테스트는 맡김으로 등록한다 */
const handedOver = () => ({ buildingId, storageType: "HANDED_OVER", storagePlaceId: placeId });
const UMBRELLA: FoundItemExtraction = {
  ...SENSITIVE,
  category: "UMBRELLA",
  categoryAlt: null,
  isSensitive: false,
  features: [],
  description: "검정 장우산",
  title: "검정 장우산",
};

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  const b = await prisma.building.create({ data: { name: "혜인관", lat: 37.6, lng: 127 } });
  buildingId = b.id;
  placeId = (
    await prisma.storagePlace.create({
      data: { name: "혜인관 경비실", buildingId, guideText: "1층 정문 옆", org: "GUARD" },
    })
  ).id;
  closedPlaceId = (
    await prisma.storagePlace.create({
      data: { name: "닫힌 곳", buildingId, guideText: "-", org: "GUARD", isActive: false },
    })
  ).id;
});

afterEach(() => {
  resetAiClient();
  resetPremasker();
});

describe("기준 1. 정상 등록은 201, 응답에는 공개 정보만", () => {
  it("보관처에 맡김", async () => {
    const res = await register({ buildingId, storageType: "HANDED_OVER", storagePlaceId: placeId }, await noisyJpeg());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      status: "REGISTERED",
      category: "EARPHONE",
      subCategory: "WIRELESS_EARBUDS",
      building: { id: buildingId, name: "혜인관" },
      floor: null,
      storageType: "HANDED_OVER",
      storagePlace: { id: placeId, name: "혜인관 경비실", guideText: "1층 정문 옆" },
      message: null,
      handOverAdvice: null,
    });
    const text = JSON.stringify(res.body);
    for (const secret of ["WHITE", "Apple", "곰돌이", "CHARGER", "found/"]) expect(text).not.toContain(secret);
  });

  it("층을 받으면 저장하고 응답에 준다 (지하는 음수)", async () => {
    const res = await register({ ...handedOver(), floor: -1 }, await noisyJpeg());
    expect(res.body.floor).toBe(-1);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: res.body.id } })).floor).toBe(-1);
  });

  it("그 자리에 둠은 보관처 없이 (귀중품이 아닐 때)", async () => {
    useExtraction(UMBRELLA);
    const res = await register(inPlace(), await noisyJpeg());
    expect(res.status).toBe(201);
    expect(res.body.storagePlace).toBeNull();
  });
});

describe("기준 2. 비공개 정보와 임베딩은 서버에만 저장", () => {
  it("상세 테이블에 색(12색 키)·브랜드·특징·설명·관리자용 제목, 2순위 종류, 임베딩", async () => {
    const { body } = await register(handedOver(), await noisyJpeg());
    const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: body.id }, include: { detail: true } });
    expect(item.categoryAlt).toBe("CHARGER");
    expect(item.detail).toMatchObject({
      color: "WHITE",
      brand: "Apple",
      isSensitive: false,
      title: "흰색 무선 이어폰, 곰돌이 스티커",
    });
    expect(item.detail?.features).toHaveLength(2);
    expect(item.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const [row] = await prisma.$queryRaw<{ dims: number }[]>`
      SELECT vector_dims(embedding) AS dims FROM found_item_detail WHERE found_item_id = ${body.id}::uuid`;
    expect(row?.dims).toBe(EMBEDDING_DIM);
  });

  it("2순위 종류가 1순위와 같으면 비워 둔다", async () => {
    useExtraction({ ...SENSITIVE, isSensitive: false, category: "ID_CARD", categoryAlt: "ID_CARD" });
    const { body } = await register(handedOver(), await noisyJpeg());
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: body.id } })).categoryAlt).toBeNull();
  });
});

describe("기준 3. 입력 검증", () => {
  it("사진이 없으면 400", async () => {
    const res = await register(handedOver());
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("image");
  });

  it("맡김인데 보관처가 없거나, 그 자리에 둠인데 보관처가 있으면 400", async () => {
    const a = await register({ buildingId, storageType: "HANDED_OVER" }, await noisyJpeg());
    const b = await register({ ...inPlace(), storagePlaceId: placeId }, await noisyJpeg());
    expect([a.status, b.status]).toEqual([400, 400]);
    expect(a.body.error.details[0].path).toBe("storagePlaceId");
  });

  it("층은 -10~30 정수만", async () => {
    for (const floor of [-11, 31, 1.5, "B1"]) {
      const res = await register({ ...handedOver(), floor }, await noisyJpeg());
      expect(res.status).toBe(400);
    }
  });

  it("없는 건물, 없는·운영 안 하는 보관처는 400", async () => {
    const img = await noisyJpeg();
    expect((await register({ buildingId: 9999, storageType: "IN_PLACE" }, img)).status).toBe(400);
    expect((await register({ buildingId, storageType: "HANDED_OVER", storagePlaceId: 9999 }, img)).status).toBe(400);
    expect(
      (await register({ buildingId, storageType: "HANDED_OVER", storagePlaceId: closedPlaceId }, img)).status,
    ).toBe(400);
    expect(await prisma.foundItem.count()).toBe(0);
  });
});

describe("기준 4. 사진 형식과 용량", () => {
  it("사진이 아닌 파일은 400", async () => {
    const res = await register(handedOver(), Buffer.from("this is not an image"));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("10MB를 넘으면 413 IMAGE_TOO_LARGE", async () => {
    const res = await register(handedOver(), Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("IMAGE_TOO_LARGE");
  });

  it("PNG·WEBP도 받는다", async () => {
    const png = await sharp(await noisyJpeg())
      .png()
      .toBuffer();
    const webp = await sharp(await noisyJpeg())
      .webp()
      .toBuffer();
    expect((await register(handedOver(), png, "ua-png")).status).toBe(201);
    expect((await register(handedOver(), webp, "ua-webp")).status).toBe(201);
  });
});

describe("기준 5. 위치 정보(EXIF)는 지우고, 회전은 적용하고, 크기는 줄인다", () => {
  it("GPS·기기 정보 제거, 세로 사진은 세로로", async () => {
    const input = await jpegWithGpsAndRotation();
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.orientation).toBe(6); // 테스트 사진 자체가 맞게 만들어졌는지
    expect(inputMeta.exif?.includes(Buffer.from("TestPhone"))).toBe(true);
    const { body } = await register(handedOver(), input);
    const detail = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: body.id } });
    for (const key of [detail.imageOriginalKey, detail.imagePublicKey]) {
      const meta = await sharp((await readLocalFile(key as string)) as Buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
      expect(meta.height).toBeGreaterThan(meta.width ?? 0); // 400x200 + 90도 회전 → 세로
    }
  });

  it("큰 사진은 원본 1600px, 공개본 1024px 이하로", async () => {
    const { body } = await register(handedOver(), await noisyJpeg(3000, 2000));
    const detail = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: body.id } });
    const orig = await sharp((await readLocalFile(detail.imageOriginalKey as string)) as Buffer).metadata();
    const pub = await sharp((await readLocalFile(detail.imagePublicKey as string)) as Buffer).metadata();
    expect(Math.max(orig.width ?? 0, orig.height ?? 0)).toBe(1600);
    expect(Math.max(pub.width ?? 0, pub.height ?? 0)).toBe(1024);
  });
});

describe("기준 6. 공개본은 개인정보만 가리고, 후보용 사진은 항상 강하게 흐린다", () => {
  async function publicSharpness(id: string) {
    const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: id } });
    return { pub: await sharpness((await readLocalFile(d.imagePublicKey as string)) as Buffer), d };
  }

  it("민감하면 공개본이 원본보다 훨씬 흐리고, 원본은 그대로", async () => {
    useExtraction(SENSITIVE);
    const { body } = await register(handedOver(), await noisyJpeg());
    const { pub, d } = await publicSharpness(body.id);
    const orig = await sharpness((await readLocalFile(d.imageOriginalKey as string)) as Buffer);
    expect(d.isSensitive).toBe(true);
    expect(pub).toBeLessThan(orig * 0.3);
  });

  it("민감하지 않으면 공개본도 선명", async () => {
    const { body } = await register(handedOver(), await noisyJpeg());
    const { pub, d } = await publicSharpness(body.id);
    const orig = await sharpness((await readLocalFile(d.imageOriginalKey as string)) as Buffer);
    expect(pub).toBeGreaterThan(orig * 0.7);
  });

  it("민감 영역을 알면 그 영역만 흐리고 나머지는 선명", async () => {
    // 400x300 사진의 왼쪽 위 1/4을 개인정보 영역으로
    useExtraction({ ...SENSITIVE, sensitiveRegions: [{ x: 0, y: 0, width: 0.25, height: 0.25 }] });
    const { body } = await register(handedOver(), await noisyJpeg(400, 300));
    const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: body.id } });
    const pub = (await readLocalFile(d.imagePublicKey as string)) as Buffer;
    const orig = (await readLocalFile(d.imageOriginalKey as string)) as Buffer;
    const crop = (img: Buffer, left: number, top: number) =>
      sharp(img).extract({ left, top, width: 80, height: 60 }).toBuffer();
    const inside = await sharpness(await crop(pub, 5, 5));
    const outside = await sharpness(await crop(pub, 300, 220));
    const origInside = await sharpness(await crop(orig, 5, 5));
    const origOutside = await sharpness(await crop(orig, 300, 220));
    expect(inside).toBeLessThan(origInside * 0.3);
    expect(outside).toBeGreaterThan(origOutside * 0.7);
  });

  it("후보용 사진은 민감 여부와 관계없이 강하게 흐린 작은 사본", async () => {
    const { body } = await register(handedOver(), await stripedJpeg(800, 600));
    const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: body.id } });
    expect(d.imageThumbKey).toBe(`found/${body.id}/thumb.jpg`);
    const thumb = (await readLocalFile(d.imageThumbKey as string)) as Buffer;
    const meta = await sharp(thumb).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(320);
    // 같은 크기로 줄이기만 한 사본과 비교해야 축소 효과가 아니라 블러를 확인할 수 있다
    const original = (await readLocalFile(d.imageOriginalKey as string)) as Buffer;
    const shrunk = await sharp(original).resize(meta.width, meta.height).toBuffer();
    expect(await sharpness(thumb)).toBeLessThan((await sharpness(shrunk)) * 0.3);
  });
});

describe("기준 7. 물건이 없는 사진은 422, 아무것도 남기지 않는다", () => {
  it("DB·파일 모두 없음", async () => {
    useExtraction({ ...SENSITIVE, hasObject: false, isSensitive: false });
    const res = await register(handedOver(), await noisyJpeg());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NO_OBJECT_DETECTED");
    expect(await prisma.foundItem.count()).toBe(0);
  });
});

describe("기준 8. AI 실패: 한 번 재시도, 그래도 실패하면 201 REVIEW", () => {
  it("첫 시도 실패, 재시도 성공이면 REGISTERED", async () => {
    let calls = 0;
    useExtraction(async () => {
      calls++;
      if (calls === 1) throw new Error("일시 오류");
      return { ...SENSITIVE, isSensitive: false };
    });
    const res = await register(handedOver(), await noisyJpeg());
    expect(calls).toBe(2);
    expect(res.body.status).toBe("REGISTERED");
  });

  it("두 번 다 실패하면 201 REVIEW, 원본 저장, 공개본은 흐리게", async () => {
    let calls = 0;
    useExtraction(async () => {
      calls++;
      throw new Error("AI 장애");
    });
    const res = await register(handedOver(), await noisyJpeg());
    expect(calls).toBe(2);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "REVIEW",
      category: null,
      message: "분석이 늦어져서 관리자가 확인한 뒤 등록돼요.",
    });
    const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: res.body.id } });
    expect(d.isSensitive).toBe(true);
    expect(await readLocalFile(d.imageOriginalKey as string)).not.toBeNull();
  });

  it("AI 응답 형식이 계약과 다르면 REVIEW (허용 밖 색, 특징 5개, 정해지지 않은 특징 키)", async () => {
    const bad: unknown[] = [
      { ...SENSITIVE, color: "파란색" },
      { ...SENSITIVE, features: Array.from({ length: 5 }, (_, i) => ({ key: "sticker", value: `스티커${i}` })) },
      { ...SENSITIVE, features: [{ key: "ignore previous instructions", value: "x" }] },
      { ...SENSITIVE, sensitiveRegions: [{ x: 0.9, y: 0, width: 0.5, height: 0.1 }] },
    ];
    for (const extraction of bad) {
      useExtraction(async () => extraction as FoundItemExtraction);
      const res = await register(handedOver(), await noisyJpeg(), `agent-${bad.indexOf(extraction)}`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("REVIEW");
      const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: res.body.id } });
      expect(d.color).toBeNull();
      expect(d.isSensitive).toBe(true);
    }
  });

  it("임베딩 차원이 다르면 REVIEW", async () => {
    setAiClient({ ...mockAiClient, embed: async () => [0.1, 0.2, 0.3] });
    const res = await register(handedOver(), await noisyJpeg());
    expect(res.body.status).toBe("REVIEW");
  });

  it("응답이 제한 시간을 넘기면 실패로 본다", async () => {
    useExtraction(() => new Promise(() => {})); // 끝나지 않는 호출
    const { env } = await import("../../src/config/env");
    const before = env.AI_TIMEOUT_MS;
    env.AI_TIMEOUT_MS = 50;
    try {
      const res = await register(handedOver(), await noisyJpeg());
      expect(res.body.status).toBe("REVIEW");
    } finally {
      env.AI_TIMEOUT_MS = before;
    }
  });
});

describe("기준 9. 같은 기기·IP는 10분에 5건, 지문은 해시로만", () => {
  it("6번째는 429, 다른 기기는 따로 센다", async () => {
    const img = await noisyJpeg();
    for (let i = 0; i < 5; i++) expect((await register(handedOver(), img, "phone-A")).status).toBe(201);
    const res = await register(handedOver(), img, "phone-A");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect((await register(handedOver(), img, "phone-B")).status).toBe(201);
  });

  it("지문은 64자리 해시, IP·기기 문자열은 저장하지 않는다", async () => {
    const { body } = await register(handedOver(), await noisyJpeg(), "phone-A");
    const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: body.id } });
    expect(item.uploaderFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(item.uploaderFingerprint).not.toContain("phone-A");
  });
});

describe("기준 10. 사진은 서명된 링크로만 볼 수 있다", () => {
  async function savedKeys() {
    const { body } = await register(handedOver(), await noisyJpeg());
    return prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: body.id } });
  }
  const pathOf = (url: string) => {
    const u = new URL(url);
    return u.pathname + u.search;
  };

  it("서명이 맞으면 200 이미지", async () => {
    const d = await savedKeys();
    const res = await request(app).get(pathOf(await storage.signedUrl(d.imagePublicKey as string, 60)));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    // 화면이 다른 주소(정적 사이트)에서 열려도 <img>로 보여야 한다
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("서명 없음·틀림·만료·다른 파일 서명은 403", async () => {
    const d = await savedKeys();
    const good = new URL(await storage.signedUrl(d.imagePublicKey as string, 60));
    const sig = good.searchParams.get("sig") ?? "";
    const exp = good.searchParams.get("exp") ?? "";
    expect((await request(app).get(`/files/${d.imagePublicKey}`)).status).toBe(403);
    expect((await request(app).get(`/files/${d.imagePublicKey}?exp=${exp}&sig=${"0".repeat(64)}`)).status).toBe(403);
    expect((await request(app).get(`/files/${d.imageOriginalKey}?exp=${exp}&sig=${sig}`)).status).toBe(403);
    const expired = new URL(await storage.signedUrl(d.imagePublicKey as string, -10));
    expect((await request(app).get(expired.pathname + expired.search)).status).toBe(403);
  });

  it("경로 조작은 막는다", async () => {
    const url = new URL(await storage.signedUrl("../../.env", 60));
    expect((await request(app).get(`/files/..%2F..%2F.env${url.search}`)).status).toBeGreaterThanOrEqual(403);
    const res = await request(app).get(url.pathname + url.search);
    expect(res.status).toBeGreaterThanOrEqual(403);
    expect(res.text).not.toContain("JWT_SECRET");
  });
});

describe("기준 11. AI에는 얼굴·글자를 가린 사본만 보낸다 (QA B3)", () => {
  it("가린 사본이 AI로 가고, 공개본도 가린 사본으로 만든다. 원본은 관리자용으로만 남는다", async () => {
    const masked = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#6b6b6b" } })
      .jpeg()
      .toBuffer();
    let premaskInput: Buffer | null = null;
    setPremasker(async (jpeg) => {
      premaskInput = jpeg;
      return { image: masked, faces: 1, texts: 2 };
    });
    let aiInput: Buffer | null = null;
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async (image) => {
        aiInput = image;
        return { ...SENSITIVE, isSensitive: false, category: "EARPHONE" };
      },
    });
    const res = await register(handedOver(), await noisyJpeg());
    expect(res.status).toBe(201);
    expect(aiInput).toBe(masked);
    const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: res.body.id } });
    // 원본은 가리기 전 사진(정규화본), 공개본은 단색인 가린 사본에서 나와 거의 평평하다
    expect(await readLocalFile(d.imageOriginalKey as string)).toEqual(premaskInput);
    expect(await sharpness((await readLocalFile(d.imagePublicKey as string)) as Buffer)).toBeLessThan(3);
  });

  it("가리기가 실패하면 원본을 AI로 보내지 않고 검토 대기로, 공개본은 전체를 흐린다", async () => {
    setPremasker(async () => {
      throw new Error("모델 없음");
    });
    let aiCalls = 0;
    useExtraction(async () => {
      aiCalls++;
      return SENSITIVE;
    });
    const res = await register(handedOver(), await noisyJpeg());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REVIEW", category: null });
    expect(aiCalls).toBe(0);
    const d = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: res.body.id } });
    expect(d.isSensitive).toBe(true);
    const original = (await readLocalFile(d.imageOriginalKey as string)) as Buffer;
    const pub = (await readLocalFile(d.imagePublicKey as string)) as Buffer;
    expect(await sharpness(pub)).toBeLessThan((await sharpness(original)) / 2);
  });
});

describe("기준 12. 귀중품은 보관처(센터·경비실)에만 맡길 수 있다 (QA B11)", () => {
  async function storedFiles() {
    const { env } = await import("../../src/config/env");
    const dir = join(env.STORAGE_LOCAL_DIR, "found");
    return existsSync(dir) ? (await readdir(dir, { recursive: true })).length : 0;
  }

  it("AI가 귀중품으로 보는데 그 자리에 둠이면 400, 물건 행도 사진 파일도 남지 않는다", async () => {
    const before = await storedFiles();
    const res = await register(inPlace(), await noisyJpeg()); // 가짜 AI: 이어폰
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "VALUABLE_HAND_OVER_REQUIRED",
      message: "귀중품은 보관처(교무처)에 맡겨 주세요.",
      details: [{ path: "storageType" }],
    });
    expect(await prisma.foundItem.count()).toBe(0);
    expect(await storedFiles()).toBe(before);
  });

  it("거절은 등록 횟수에 세지 않고, 같은 사진을 보관처에 맡기면 201", async () => {
    for (let i = 0; i < 5; i++) expect((await register(inPlace(), await noisyJpeg(), "phone-V")).status).toBe(400);
    const res = await register(handedOver(), await noisyJpeg(), "phone-V");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: "EARPHONE", storageType: "HANDED_OVER", handOverAdvice: null });
  });

  it("AI가 실패해 종류를 모르면(REVIEW) 막지 않고 관리자가 확인한다", async () => {
    useExtraction(async () => {
      throw new Error("AI 장애");
    });
    const res = await register(inPlace(), await noisyJpeg());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REVIEW", storageType: "IN_PLACE", handOverAdvice: null });
  });
});
