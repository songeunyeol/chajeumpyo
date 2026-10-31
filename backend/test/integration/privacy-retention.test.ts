// 개인정보 보관 기간과 좌표 처리 (#22, open-issues #33·#34): 이슈의 완료 기준 10개
import { Writable } from "node:stream";
import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { purgeExpiredRecords } from "../../src/jobs/record-purge";
import { requestLogSerializers } from "../../src/lib/logger";
import { expireUnclaimedItems, purgeClaimedItems } from "../../src/services/data-purge";
import { storage } from "../../src/storage";
import { readLocalFile } from "../../src/storage/local";
import { createAdmin, demoLogin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let placeId: number;
let user: Awaited<ReturnType<typeof signupUser>>;
let adminToken: string;

const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 86_400_000;

async function adminLogin(email: string, place: number | null) {
  await createAdmin(email, "adminpass1", place);
  return (await request(app).post("/api/v1/admin/auth/login").send({ email, password: "adminpass1" })).body
    .accessToken as string;
}

/** 저장소에 실제 사진 세 장을 둔 습득물 (+ 이 계정이 통과한 시도·열람 기록) */
async function itemWithFiles(
  storageType: "IN_PLACE" | "HANDED_OVER",
  over: Partial<Parameters<typeof createFoundItem>[0]> = {},
  userId = user.user.id,
) {
  const item = await createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    color: "WHITE",
    brand: "Apple",
    features: [{ key: "sticker", value: "곰돌이 스티커" }],
    foundAt: hoursAgo(1),
    storageType,
    storagePlaceId: storageType === "HANDED_OVER" ? placeId : null,
    status: "REVEALED",
    ...over,
  });
  const keys = {
    imageOriginalKey: `found/${item.id}/original.jpg`,
    imagePublicKey: `found/${item.id}/public.jpg`,
    imageThumbKey: `found/${item.id}/thumb.jpg`,
  };
  for (const key of Object.values(keys)) await storage.put(key, Buffer.from(`img:${key}`), "image/jpeg");
  await prisma.foundItemDetail.update({ where: { foundItemId: item.id }, data: { ...keys, title: "흰색 이어폰" } });
  const attempt = await createAttempt(userId, item.id, { result: "PASS" });
  await prisma.revealLog.create({ data: { userId, foundItemId: item.id, matchAttemptId: attempt.id } });
  return { item, keys };
}

async function filesLeft(keys: Record<string, string>) {
  const found = await Promise.all(Object.values(keys).map((k) => readLocalFile(k)));
  return found.filter((f) => f !== null).length;
}

async function embeddingIsNull(id: string) {
  const [row] = await prisma.$queryRaw<{ empty: boolean }[]>`
    SELECT embedding IS NULL AS empty FROM found_item_detail WHERE found_item_id = ${id}::uuid`;
  return row?.empty;
}

async function qrPickup(itemId: string) {
  const qr = await request(app).post(`/api/v1/found-items/${itemId}/pickup-qr`).set(as(user.accessToken)).expect(200);
  return request(app).post(`/api/v1/admin/pickups/${qr.body.pickupId}/complete`).set(as(adminToken));
}

beforeEach(async () => {
  await resetDb();
  app = createApp();
  A = (await createBuilding("혜인관", 37.6, 127)).id;
  placeId = (await createStoragePlace("혜인관 경비실", A)).id;
  user = await signupUser(app);
  adminToken = await adminLogin("guard@skuniv.ac.kr", placeId);
});

afterEach(() => vi.restoreAllMocks());

describe("기준 1. 보관처 수령이 끝나면 사진 3장을 바로 지운다", () => {
  it("저장소에서 사라지고, 예전 서명 URL도 열리지 않는다", async () => {
    const { item, keys } = await itemWithFiles("HANDED_OVER");
    const oldUrl = new URL(await storage.signedUrl(keys.imagePublicKey, 600));
    expect((await request(app).get(oldUrl.pathname + oldUrl.search)).status).toBe(200);

    expect((await qrPickup(item.id)).status).toBe(200);
    expect(await filesLeft(keys)).toBe(0);
    expect((await request(app).get(oldUrl.pathname + oldUrl.search)).status).toBe(404);
  });
});

describe("기준 2. 비공개 정보·임베딩은 비우고 공개 정보는 남긴다", () => {
  it("색·브랜드·특징·설명·제목·AI 원문·임베딩 비움, 종류·건물·날짜·상태 유지", async () => {
    const { item } = await itemWithFiles("HANDED_OVER");
    await prisma.foundItemDetail.update({ where: { foundItemId: item.id }, data: { rawAiResponse: { x: 1 } } });
    await qrPickup(item.id);
    const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id }, include: { detail: true } });
    expect(after).toMatchObject({ status: "CLAIMED", category: "EARPHONE", buildingId: A, foundAt: item.foundAt });
    expect(after.dataPurgedAt).not.toBeNull();
    expect(after.detail).toMatchObject({
      imageOriginalKey: null,
      imagePublicKey: null,
      imageThumbKey: null,
      color: null,
      brand: null,
      features: [],
      description: null,
      title: null,
      rawAiResponse: null,
    });
    expect(await embeddingIsNull(item.id)).toBe(true);
  });
});

describe("기준 3. '찾았어요'로 끝난 물건도 똑같이 지운다", () => {
  it("그 자리에 둔 물건", async () => {
    const { item, keys } = await itemWithFiles("IN_PLACE");
    await request(app).post(`/api/v1/found-items/${item.id}/self-pickup`).set(as(user.accessToken)).expect(200);
    expect(await filesLeft(keys)).toBe(0);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).dataPurgedAt).not.toBeNull();
  });
});

describe("기준 4. 체험 수령은 시드를 지우지 않는다", () => {
  it("보관처 QR(바로 완료)과 '찾았어요' 모두 사진·정보·상태 그대로", async () => {
    const demo = await demoLogin(app);
    const handed = await itemWithFiles("HANDED_OVER", { isSeed: true }, demo.user.id);
    const inPlace = await itemWithFiles("IN_PLACE", { isSeed: true }, demo.user.id);
    await request(app).post(`/api/v1/found-items/${handed.item.id}/pickup-qr`).set(as(demo.accessToken)).expect(200);
    await request(app).post(`/api/v1/found-items/${inPlace.item.id}/self-pickup`).set(as(demo.accessToken)).expect(200);
    for (const x of [handed, inPlace]) {
      expect(await filesLeft(x.keys)).toBe(3);
      const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: x.item.id }, include: { detail: true } });
      expect(after.dataPurgedAt).toBeNull();
      expect(after.detail?.color).toBe("WHITE");
      expect(after.status).toBe("REVEALED");
    }
  });
});

describe("기준 5. 바로 지우기가 실패해도 수령은 끝나고, 정기 작업이 다시 지운다", () => {
  it("저장소 오류 → 수령 200, 사진 남음 → 재시도로 삭제", async () => {
    const { item, keys } = await itemWithFiles("HANDED_OVER");
    const del = vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("저장소 장애"));
    expect((await qrPickup(item.id)).status).toBe(200);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("CLAIMED");
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).dataPurgedAt).toBeNull();
    del.mockRestore();

    expect(await purgeClaimedItems()).toBe(1);
    expect(await filesLeft(keys)).toBe(0);
    expect(await purgeClaimedItems()).toBe(0); // 이미 지운 건 다시 안 건드린다
  });
});

describe("기준 6. 보관 기한이 지난 미수령 물건은 기한 만료로 바꾸고 지운다", () => {
  it("기한 지난 일반 물건만, 시드와 기한 안 물건은 그대로", async () => {
    const old = await itemWithFiles("IN_PLACE", { expiresAt: hoursAgo(1), status: "REGISTERED" });
    const review = await itemWithFiles("IN_PLACE", { expiresAt: hoursAgo(1), status: "REVIEW" });
    const seed = await itemWithFiles("IN_PLACE", { expiresAt: hoursAgo(1), isSeed: true });
    const fresh = await itemWithFiles("IN_PLACE", { expiresAt: new Date(Date.now() + DAY) });

    expect(await expireUnclaimedItems()).toBe(2);
    for (const x of [old, review]) {
      const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: x.item.id } });
      expect(after.status).toBe("EXPIRED");
      expect(after.dataPurgedAt).not.toBeNull();
      expect(await filesLeft(x.keys)).toBe(0);
    }
    for (const x of [seed, fresh]) {
      expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: x.item.id } })).dataPurgedAt).toBeNull();
      expect(await filesLeft(x.keys)).toBe(3);
    }
  });

  it("기한 만료된 물건은 후보에서 빠지고 공개 화면은 410 보관 끝남 (10/31 검증)", async () => {
    const { item } = await itemWithFiles("IN_PLACE", { expiresAt: hoursAgo(1), status: "REGISTERED" });
    await expireUnclaimedItems();
    const res = await request(app).get(`/api/v1/found-items/${item.id}/detail`).set(as(user.accessToken));
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("ITEM_CLOSED");
    expect(res.body.error.message).toContain("보관이 끝난");
  });
});

describe("기준 7. 시도·열람·수령 기록은 수령·만료 30일 뒤 지운다", () => {
  it("기간이 지난 것만", async () => {
    const claimedOld = await itemWithFiles("IN_PLACE");
    const claimedNew = await itemWithFiles("IN_PLACE");
    for (const x of [claimedOld, claimedNew]) {
      await request(app).post(`/api/v1/found-items/${x.item.id}/self-pickup`).set(as(user.accessToken)).expect(200);
    }
    await prisma.pickup.updateMany({ where: { foundItemId: claimedOld.item.id }, data: { purgeAfter: hoursAgo(1) } });
    const expiredOld = await itemWithFiles("IN_PLACE", {
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 31 * DAY),
    });
    const expiredNew = await itemWithFiles("IN_PLACE", {
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 29 * DAY),
    });

    const result = await purgeExpiredRecords();
    expect(result).toMatchObject({ items: 2, pickups: 1 });
    for (const id of [claimedOld.item.id, expiredOld.item.id]) {
      expect(await prisma.matchAttempt.count({ where: { foundItemId: id } })).toBe(0);
      expect(await prisma.revealLog.count({ where: { foundItemId: id } })).toBe(0);
      expect(await prisma.pickup.count({ where: { foundItemId: id } })).toBe(0);
    }
    for (const id of [claimedNew.item.id, expiredNew.item.id]) {
      expect(await prisma.matchAttempt.count({ where: { foundItemId: id } })).toBe(1);
      expect(await prisma.revealLog.count({ where: { foundItemId: id } })).toBe(1);
    }
    expect(await prisma.pickup.count({ where: { foundItemId: claimedNew.item.id } })).toBe(1);
  });
});

describe("기준 8. 지운 물건도 관리자·공개 화면이 안전하게 응답한다", () => {
  it("관리자 상세는 사진 링크 null, 통과자가 다시 열면 409 ALREADY_CLAIMED", async () => {
    const { item } = await itemWithFiles("HANDED_OVER");
    await qrPickup(item.id);
    const detail = await request(app).get(`/api/v1/admin/found-items/${item.id}`).set(as(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      originalImageUrl: null,
      publicImageUrl: null,
      thumbnailUrl: null,
      color: null,
    });
    const again = await request(app).get(`/api/v1/found-items/${item.id}/detail`).set(as(user.accessToken));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CLAIMED");
  });
});

describe("기준 9. 서버는 좌표를 받지 않는다", () => {
  it("/buildings/nearest는 없고, 건물 목록에 좌표가 있다", async () => {
    expect((await request(app).get("/api/v1/buildings/nearest?lat=37.6&lng=127")).status).toBe(404);
    const res = await request(app).get("/api/v1/buildings");
    expect(res.body.buildings[0]).toMatchObject({ name: "혜인관", lat: 37.6, lng: 127 });
  });
});

describe("기준 10. 요청 로그에 쿼리 문자열과 인증 헤더가 남지 않는다", () => {
  it("메서드·경로·상태만", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logged = express();
    logged.use(pinoHttp({ logger: pino(sink), serializers: requestLogSerializers }));
    logged.get("/api/v1/buildings", (_req, res) => {
      res.json({ ok: true });
    });
    await request(logged)
      .get("/api/v1/buildings?lat=37.6123&lng=127.0456")
      .set("Authorization", "Bearer secret-token-123")
      .expect(200);
    const out = lines.join("");
    expect(out).toContain('"path":"/api/v1/buildings"');
    expect(out).toContain('"statusCode":200');
    for (const leak of ["37.6123", "127.0456", "secret-token-123", "authorization", "remoteAddress"]) {
      expect(out.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });
});
