// F-11 수령 처리, F-12 기록 삭제: 이슈의 완료 기준 10개
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { purgeExpiredRecords } from "../../src/jobs/record-purge";
import { createAdmin, demoLogin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let placeId: number;
let otherPlaceId: number;
let user: Awaited<ReturnType<typeof signupUser>>;
let adminToken: string;

const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const qr = (id: string, t = user.accessToken) => request(app).post(`/api/v1/found-items/${id}/pickup-qr`).set(as(t));
const self = (id: string, t = user.accessToken) =>
  request(app).post(`/api/v1/found-items/${id}/self-pickup`).set(as(t));
const scan = (qrToken: string, t = adminToken) =>
  request(app).post("/api/v1/admin/pickups/scan").set(as(t)).send({ qrToken });
const complete = (id: string, t = adminToken) => request(app).post(`/api/v1/admin/pickups/${id}/complete`).set(as(t));

async function adminLogin(email: string, place: number | null) {
  await createAdmin(email, "adminpass1", place);
  return (await request(app).post("/api/v1/admin/auth/login").send({ email, password: "adminpass1" })).body
    .accessToken as string;
}

async function passedItem(storageType: "IN_PLACE" | "HANDED_OVER", userId = user.user.id, over = {}) {
  const item = await createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    foundAt: hoursAgo(1),
    storageType,
    storagePlaceId: storageType === "HANDED_OVER" ? placeId : null,
    status: "REVEALED",
    ...over,
  });
  const attempt = await createAttempt(userId, item.id, { result: "PASS" });
  return { item, attempt };
}

beforeEach(async () => {
  await resetDb();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  placeId = (await createStoragePlace("혜인관 경비실", A)).id;
  otherPlaceId = (await createStoragePlace("청운관 경비실", A)).id;
  user = await signupUser(app);
  adminToken = await adminLogin("guard@skuniv.ac.kr", placeId);
});

describe("기준 1. QR은 통과한 계정이 맡긴 물건에만, 서버에는 해시만", () => {
  it("발급: 토큰은 응답에만, DB에는 해시, 24시간 만료", async () => {
    const { item } = await passedItem("HANDED_OVER");
    const res = await qr(item.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ method: "CENTER_QR", status: "ISSUED", qrToken: expect.stringMatching(/^pk_/) });
    const p = await prisma.pickup.findUniqueOrThrow({ where: { id: res.body.pickupId } });
    expect(p.qrTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.qrTokenHash).not.toContain(res.body.qrToken);
    const hours = ((p.qrExpiresAt as Date).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it("통과하지 않았으면 403", async () => {
    const item = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      storageType: "HANDED_OVER",
      storagePlaceId: placeId,
    });
    expect((await qr(item.id)).status).toBe(403);
  });
});

describe("기준 2. 보관 위치에 맞는 수령 방법만", () => {
  it("그 자리에 둔 물건에 QR, 맡긴 물건에 '찾았어요'는 409 INVALID_STORAGE_TYPE", async () => {
    const { item: inPlace } = await passedItem("IN_PLACE");
    const { item: handed } = await passedItem("HANDED_OVER");
    expect((await qr(inPlace.id)).body.error.code).toBe("INVALID_STORAGE_TYPE");
    expect((await self(handed.id)).body.error.code).toBe("INVALID_STORAGE_TYPE");
  });
});

describe("기준 3. 다시 발급받으면 이전 QR은 만료", () => {
  it("내 이전 QR은 410, 다른 사람 QR은 그대로", async () => {
    const { item } = await passedItem("HANDED_OVER");
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await createAttempt(other.user.id, item.id, { result: "PASS" });
    const theirs = (await qr(item.id, other.accessToken)).body.qrToken;
    const first = (await qr(item.id)).body.qrToken;
    const second = (await qr(item.id)).body.qrToken;
    expect((await scan(first)).status).toBe(410);
    expect((await scan(second)).status).toBe(200);
    expect((await scan(theirs)).status).toBe(200);
  });
});

describe("기준 4. 관리자 스캔", () => {
  it("물건 정보·원본 사진 링크·가린 이메일", async () => {
    const { item } = await passedItem("HANDED_OVER");
    const { body } = await qr(item.id);
    const res = await scan(body.qrToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pickupId: body.pickupId,
      foundItem: { id: item.id, category: "EARPHONE", building: "혜인관" },
      claimant: { emailMasked: "st*****@skuniv.ac.kr" },
    });
    expect(new URL(res.body.foundItem.imageUrl).pathname).toBe("/files/test/original.jpg");
    expect(JSON.stringify(res.body)).not.toContain("student@");
  });

  it("다른 보관처 관리자 403, 회원 토큰 403, 없는 QR 404", async () => {
    const { item } = await passedItem("HANDED_OVER");
    const { body } = await qr(item.id);
    const otherAdmin = await adminLogin("other-guard@skuniv.ac.kr", otherPlaceId);
    expect((await scan(body.qrToken, otherAdmin)).status).toBe(403);
    expect((await complete(body.pickupId, otherAdmin)).status).toBe(403);
    expect((await scan(body.qrToken, user.accessToken)).status).toBe(403);
    expect((await scan("pk_nope")).status).toBe(404);
  });
});

describe("기준 5. 만료된 QR은 스캔·완료 모두 410", () => {
  it("24시간 지난 QR", async () => {
    const { item } = await passedItem("HANDED_OVER");
    const { body } = await qr(item.id);
    await prisma.pickup.update({ where: { id: body.pickupId }, data: { qrExpiresAt: hoursAgo(0.1) } });
    expect((await scan(body.qrToken)).body.error.code).toBe("QR_EXPIRED");
    expect((await complete(body.pickupId)).body.error.code).toBe("QR_EXPIRED");
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REVEALED");
  });
});

describe("기준 6. 완료 처리", () => {
  it("수령 기록·물건 CLAIMED·신고 RESOLVED·다른 사람 QR 만료", async () => {
    const { item, attempt } = await passedItem("HANDED_OVER");
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await createAttempt(other.user.id, item.id, { result: "PASS" });
    const theirs = (await qr(item.id, other.accessToken)).body;
    const { body } = await qr(item.id);

    const res = await complete(body.pickupId);
    expect(res.body).toMatchObject({ pickupId: body.pickupId, status: "COMPLETED" });
    const p = await prisma.pickup.findUniqueOrThrow({ where: { id: body.pickupId } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "guard@skuniv.ac.kr" } });
    expect(p.processedByAdminId).toBe(admin.id);
    const days = ((p.purgeAfter as Date).getTime() - (p.completedAt as Date).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("CLAIMED");
    expect((await prisma.lostReport.findUniqueOrThrow({ where: { id: attempt.lostReportId } })).status).toBe(
      "RESOLVED",
    );
    expect((await prisma.pickup.findUniqueOrThrow({ where: { id: theirs.pickupId } })).status).toBe("EXPIRED");
    expect((await scan(theirs.qrToken)).status).toBe(409);
  });
});

describe("기준 7. 먼저 완료된 쪽만, 완료 뒤에는 새 QR도 없다", () => {
  it("두 QR을 동시에 완료하면 하나만 성공", async () => {
    const { item } = await passedItem("HANDED_OVER");
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await createAttempt(other.user.id, item.id, { result: "PASS" });
    const a = (await qr(item.id)).body.pickupId;
    const b = (await qr(item.id, other.accessToken)).body.pickupId;
    const results = await Promise.all([complete(a), complete(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.pickup.count({ where: { foundItemId: item.id, status: "COMPLETED" } })).toBe(1);
    expect((await qr(item.id)).body.error.code).toBe("ALREADY_CLAIMED");
    expect((await complete(a)).status).toBe(409);
  });
});

describe("기준 8. 그 자리에 둔 물건은 본인이 완료", () => {
  it("SELF_REPORT 완료, 물건 CLAIMED, 두 번째 사람은 409", async () => {
    const { item } = await passedItem("IN_PLACE");
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await createAttempt(other.user.id, item.id, { result: "PASS" });
    const res = await self(item.id);
    expect(res.body).toMatchObject({ method: "SELF_REPORT", status: "COMPLETED" });
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("CLAIMED");
    expect((await self(item.id, other.accessToken)).body.error.code).toBe("ALREADY_CLAIMED");
  });
});

describe("기준 9. 체험 계정은 관리자 없이 바로 완료, 시드는 그대로", () => {
  it("맡긴 시드: QR 대신 DEMO 완료, 여러 체험 계정이 반복 가능", async () => {
    const seed = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      storageType: "HANDED_OVER",
      storagePlaceId: placeId,
      isSeed: true,
      foundAt: hoursAgo(1),
    });
    for (let i = 0; i < 3; i++) {
      const demo = await demoLogin(app);
      await createAttempt(demo.user.id, seed.id, { result: "PASS" });
      const res = await qr(seed.id, demo.accessToken);
      expect(res.body).toMatchObject({ method: "DEMO", status: "COMPLETED" });
      expect(res.body.qrToken).toBeUndefined();
    }
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: seed.id } })).status).toBe("REGISTERED");
    expect(await prisma.pickup.count({ where: { foundItemId: seed.id, method: "DEMO", status: "COMPLETED" } })).toBe(3);
  });

  it("그 자리에 둔 시드도 DEMO로 완료", async () => {
    const seed = await createFoundItem({ buildingId: A, category: "EARPHONE", isSeed: true, foundAt: hoursAgo(1) });
    for (let i = 0; i < 2; i++) {
      const demo = await demoLogin(app);
      await createAttempt(demo.user.id, seed.id, { result: "PASS" });
      expect((await self(seed.id, demo.accessToken)).body).toMatchObject({ method: "DEMO", status: "COMPLETED" });
    }
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: seed.id } })).status).toBe("REGISTERED");
  });
});

describe("기준 10. 수령 후 30일이 지나면 시도·열람 기록을 지운다", () => {
  it("기한 지난 물건만, 다른 물건 기록은 그대로", async () => {
    const { item: old } = await passedItem("IN_PLACE");
    const { item: recent } = await passedItem("IN_PLACE");
    const { item: open } = await passedItem("IN_PLACE");
    for (const it of [old, recent, open]) {
      const a = await prisma.matchAttempt.findFirstOrThrow({ where: { foundItemId: it.id } });
      await prisma.revealLog.create({ data: { userId: user.user.id, foundItemId: it.id, matchAttemptId: a.id } });
    }
    await self(old.id).expect(200);
    await self(recent.id).expect(200);
    await prisma.pickup.updateMany({ where: { foundItemId: old.id }, data: { purgeAfter: hoursAgo(1) } });

    const result = await purgeExpiredRecords();
    expect(result).toEqual({ items: 1, reveals: 1, attempts: 1 });
    expect(await prisma.matchAttempt.count({ where: { foundItemId: old.id } })).toBe(0);
    expect(await prisma.revealLog.count({ where: { foundItemId: old.id } })).toBe(0);
    for (const it of [recent, open]) {
      expect(await prisma.matchAttempt.count({ where: { foundItemId: it.id } })).toBe(1);
      expect(await prisma.revealLog.count({ where: { foundItemId: it.id } })).toBe(1);
    }
    expect(await prisma.pickup.count({ where: { foundItemId: old.id } })).toBe(1);
  });
});
