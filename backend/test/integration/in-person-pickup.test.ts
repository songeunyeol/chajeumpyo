// 대면 확인 수령 (#29 후속, #8 리뷰): 온라인 확인이 막힌 물건을 관리자가 신분 확인 후 수령 완료
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { purgeExpiredRecords } from "../../src/jobs/record-purge";
import { createAdmin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let placeId: number;
let otherPlaceId: number;
let guardToken: string;
let guardId: string;

const NOTE = "학생증 이름·학번 확인, 곰돌이 스티커 위치 설명 일치";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const inPerson = (id: string, verificationNote: unknown = NOTE, t = guardToken) =>
  request(app).post(`/api/v1/admin/found-items/${id}/in-person-pickup`).set(as(t)).send({ verificationNote });

async function adminLogin(email: string, place: number | null) {
  const admin = await createAdmin(email, "adminpass1", place);
  const token = (await request(app).post("/api/v1/admin/auth/login").send({ email, password: "adminpass1" })).body
    .accessToken as string;
  return { id: admin.id, token };
}

/** 모든 계정 실패 10회로 잠긴 물건 (잠금 자체는 claim-lock.test.ts에서 본다) */
async function lockedItem(over: Partial<Parameters<typeof createFoundItem>[0]> = {}) {
  const item = await createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    foundAt: hoursAgo(1),
    storageType: "HANDED_OVER",
    storagePlaceId: placeId,
    status: "REGISTERED",
    ...over,
  });
  await prisma.foundItem.update({ where: { id: item.id }, data: { claimLockedAt: new Date() } });
  return item;
}

beforeEach(async () => {
  await resetDb();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  placeId = (await createStoragePlace("혜인관 경비실", A)).id;
  otherPlaceId = (await createStoragePlace("청운관 경비실", A)).id;
  ({ id: guardId, token: guardToken } = await adminLogin("guard@skuniv.ac.kr", placeId));
});

describe("기준 1. 잠긴 물건을 처리 관리자·메모와 함께 수령 완료", () => {
  it("계정 없는 IN_PERSON 기록, 물건 CLAIMED, 30일 뒤 삭제 예정, 사진·비공개 정보는 바로 삭제", async () => {
    const item = await lockedItem();
    const res = await inPerson(item.id, `  ${NOTE}  `);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pickupId: expect.any(String),
      method: "IN_PERSON",
      status: "COMPLETED",
      completedAt: expect.any(String),
    });
    const p = await prisma.pickup.findUniqueOrThrow({ where: { id: res.body.pickupId } });
    expect(p).toMatchObject({ userId: null, processedByAdminId: guardId, verificationNote: NOTE, qrTokenHash: null });
    const days = ((p.purgeAfter as Date).getTime() - (p.completedAt as Date).getTime()) / 86_400_000;
    expect(days).toBe(30);
    const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id }, include: { detail: true } });
    expect(after.status).toBe("CLAIMED");
    expect(after.dataPurgedAt).not.toBeNull();
    expect(after.detail?.description).toBeNull();
  });
});

describe("기준 2. 잠기지 않았거나 보관 중이 아닌 물건은 막는다", () => {
  it("안 잠긴 물건 409 NOT_IN_PERSON_ITEM, 기록 안 생김", async () => {
    const item = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      storageType: "HANDED_OVER",
      storagePlaceId: placeId,
    });
    const res = await inPerson(item.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NOT_IN_PERSON_ITEM");
    expect(await prisma.pickup.count()).toBe(0);
  });

  it("잠겼어도 기한 만료·검토 대기면 409, 이미 수령됐으면 409 ALREADY_CLAIMED", async () => {
    for (const status of ["EXPIRED", "REVIEW"] as const) {
      const res = await inPerson((await lockedItem({ status })).id);
      expect(res.body.error.code, status).toBe("NOT_IN_PERSON_ITEM");
    }
    const claimed = await lockedItem({ status: "CLAIMED" });
    expect((await inPerson(claimed.id)).body.error.code).toBe("ALREADY_CLAIMED");
    expect(await prisma.pickup.count()).toBe(0);
  });

  it("없는 물건 404", async () => {
    expect((await inPerson("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("기준 3. 관리 범위 안의 관리자만", () => {
  it("다른 경비실 403, 일반 계정 403, 종합서비스센터는 그 자리에 둔 물건도", async () => {
    const item = await lockedItem();
    const other = await adminLogin("other@skuniv.ac.kr", otherPlaceId);
    expect((await inPerson(item.id, NOTE, other.token)).status).toBe(403);
    const user = await signupUser(app);
    expect((await inPerson(item.id, NOTE, user.accessToken)).status).toBe(403);
    expect(await prisma.pickup.count()).toBe(0);

    const centerPlace = (await createStoragePlace("종합서비스센터", A, "CENTER")).id;
    const center = await adminLogin("center@skuniv.ac.kr", centerPlace);
    const inPlace = await lockedItem({ storageType: "IN_PLACE", storagePlaceId: null });
    expect((await inPerson(inPlace.id, NOTE, center.token)).status).toBe(200);
  });
});

describe("기준 4. 메모는 필수, 200자까지", () => {
  it("빈 값·공백·201자 400", async () => {
    const item = await lockedItem();
    for (const bad of [null, "", "   ", "가".repeat(201)]) expect((await inPerson(item.id, bad)).status).toBe(400);
    expect((await inPerson(item.id, "가".repeat(200))).status).toBe(200);
  });
});

describe("기준 5. 잠기기 전에 통과한 계정이 받아 둔 QR은 만료", () => {
  it("발급된 QR 만료, 그 계정이 다시 받으려 하면 409 ALREADY_CLAIMED", async () => {
    const item = await lockedItem();
    const user = await signupUser(app);
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    const issued = await request(app).post(`/api/v1/found-items/${item.id}/pickup-qr`).set(as(user.accessToken));
    expect(issued.status).toBe(200);

    expect((await inPerson(item.id)).status).toBe(200);
    expect((await prisma.pickup.findUniqueOrThrow({ where: { id: issued.body.pickupId } })).status).toBe("EXPIRED");
    const again = await request(app).post(`/api/v1/found-items/${item.id}/pickup-qr`).set(as(user.accessToken));
    expect(again.body.error.code).toBe("ALREADY_CLAIMED");
  });
});

describe("기준 6. 동시에 눌러도 한 번만", () => {
  it("둘 중 하나만 200", async () => {
    const item = await lockedItem();
    const results = await Promise.all([inPerson(item.id), inPerson(item.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.pickup.count({ where: { method: "IN_PERSON" } })).toBe(1);
  });
});

describe("기준 7. 관리자 상세에 기록이 보이고, 30일 뒤 메모까지 지운다", () => {
  it("상세: 계정 없음, 처리 관리자(가림), 메모. 배치 후 기록 삭제", async () => {
    const item = await lockedItem();
    await inPerson(item.id);
    const detail = await request(app).get(`/api/v1/admin/found-items/${item.id}`).set(as(guardToken));
    expect(detail.body.pickups).toEqual([
      expect.objectContaining({
        method: "IN_PERSON",
        status: "COMPLETED",
        emailMasked: null,
        processedByEmailMasked: "gu****@skuniv.ac.kr",
        verificationNote: NOTE,
      }),
    ]);

    expect((await purgeExpiredRecords(new Date(Date.now() + 29 * 86_400_000))).pickups).toBe(0);
    expect((await purgeExpiredRecords(new Date(Date.now() + 31 * 86_400_000))).pickups).toBe(1);
    expect(await prisma.pickup.count()).toBe(0);
  });
});

describe("기준 8. DB 제약: 계정 없는 수령은 대면 확인만, 대면 확인은 관리자·메모 필수", () => {
  it("어긋나면 DB가 거부", async () => {
    const item = await lockedItem();
    const base = { foundItemId: item.id, status: "COMPLETED" as const, completedAt: new Date() };
    await expect(prisma.pickup.create({ data: { ...base, method: "SELF_REPORT" } })).rejects.toThrow();
    await expect(
      prisma.pickup.create({ data: { ...base, method: "IN_PERSON", processedByAdminId: guardId } }),
    ).rejects.toThrow();
    await expect(
      prisma.pickup.create({ data: { ...base, method: "IN_PERSON", verificationNote: NOTE } }),
    ).rejects.toThrow();
    const user = await signupUser(app);
    await expect(
      prisma.pickup.create({ data: { ...base, method: "SELF_REPORT", userId: user.user.id, verificationNote: NOTE } }),
    ).rejects.toThrow();
    expect(await prisma.pickup.count()).toBe(0);
  });
});
