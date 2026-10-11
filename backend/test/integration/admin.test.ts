// F-14 관리자 기본 화면(백엔드): 이슈의 완료 기준 10개
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import { createAdmin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let guardPlace: number;
let otherPlace: number;
let guard: string;
let center: string;
let user: Awaited<ReturnType<typeof signupUser>>;

const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const list = (t: string, q = "") => request(app).get(`/api/v1/admin/found-items${q}`).set(as(t));
const detail = (t: string, id: string) => request(app).get(`/api/v1/admin/found-items/${id}`).set(as(t));
const patch = (t: string, id: string, body: object) =>
  request(app).patch(`/api/v1/admin/found-items/${id}`).set(as(t)).send(body);

async function login(email: string, place: number | null) {
  await createAdmin(email, "adminpass1", place);
  return (await request(app).post("/api/v1/admin/auth/login").send({ email, password: "adminpass1" })).body
    .accessToken as string;
}

const at = (place: number | null, over: Partial<Parameters<typeof createFoundItem>[0]> = {}) =>
  createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    foundAt: hoursAgo(1),
    storageType: place ? "HANDED_OVER" : "IN_PLACE",
    storagePlaceId: place,
    ...over,
  });

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  guardPlace = (await createStoragePlace("혜인관 경비실", A)).id;
  otherPlace = (await createStoragePlace("청운관 경비실", A)).id;
  const centerPlace = (await createStoragePlace("종합서비스센터", A, "CENTER")).id;
  guard = await login("guard@skuniv.ac.kr", guardPlace);
  center = await login("center@skuniv.ac.kr", centerPlace);
  user = await signupUser(app);
});

afterEach(() => resetAiClient());

describe("기준 1. 목록: 상태 필터, 20개씩, 최신순, 전체 수", () => {
  it("검토 대기만 거르고 페이지를 나눈다", async () => {
    for (let i = 0; i < 25; i++) await at(guardPlace, { status: "REVIEW", category: null, foundAt: hoursAgo(i + 1) });
    await at(guardPlace);
    const p1 = await list(guard, "?status=REVIEW");
    expect(p1.body).toMatchObject({ page: 1, pageSize: 20, total: 25 });
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items.every((i: { status: string }) => i.status === "REVIEW")).toBe(true);
    const times = p1.body.items.map((i: { foundAt: string }) => Date.parse(i.foundAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect((await list(guard, "?status=REVIEW&page=2")).body.items).toHaveLength(5);
  });

  it("상태별 개수를 함께 준다", async () => {
    await at(guardPlace, { status: "REVIEW", category: null });
    await at(guardPlace, { status: "REVIEW", category: null });
    await at(guardPlace, { status: "CLAIMED" });
    expect((await list(guard)).body.counts).toEqual({ REVIEW: 2, CLAIMED: 1 });
  });

  it("잘못된 필터는 400", async () => {
    expect((await list(guard, "?status=NOPE")).status).toBe(400);
    expect((await list(guard, "?page=0")).status).toBe(400);
  });
});

describe("기준 2. 관리 범위: 경비실은 자기 보관처만, 센터는 전체", () => {
  it("범위대로 보인다", async () => {
    const mine = await at(guardPlace);
    const other = await at(otherPlace);
    const noPlace = await at(null, { status: "REVIEW", category: null });
    const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map((i) => i.id).sort();
    expect(ids(await list(guard))).toEqual([mine.id]);
    expect(ids(await list(center))).toEqual([mine.id, other.id, noPlace.id].sort());
    const noPlaceAdmin = await login("super@skuniv.ac.kr", null);
    expect(ids(await list(noPlaceAdmin))).toHaveLength(3);
  });
});

describe("기준 3. 상세: 비공개 정보, 원본 사진, 기록 전체 (이메일은 가림)", () => {
  it("시도·열람·수령 기록과 두 사진 링크", async () => {
    const item = await at(guardPlace, {
      color: "흰색",
      brand: "Apple",
      features: [{ key: "sticker", value: "곰돌이" }],
      description: "흰색 에어팟",
    });
    const attempt = await createAttempt(user.user.id, item.id, { result: "PASS" });
    await prisma.revealLog.create({ data: { userId: user.user.id, foundItemId: item.id, matchAttemptId: attempt.id } });
    await prisma.pickup.create({
      data: { foundItemId: item.id, userId: user.user.id, method: "CENTER_QR", status: "ISSUED" },
    });

    const res = await detail(guard, item.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: item.id,
      color: "흰색",
      brand: "Apple",
      features: [{ key: "sticker", value: "곰돌이" }],
      description: "흰색 에어팟",
      attempts: [{ emailMasked: "st*****@skuniv.ac.kr", result: "PASS" }],
      reveals: [{ emailMasked: "st*****@skuniv.ac.kr" }],
      pickups: [{ method: "CENTER_QR", status: "ISSUED" }],
    });
    expect(new URL(res.body.originalImageUrl).pathname).toBe("/files/test/original.jpg");
    expect(new URL(res.body.publicImageUrl).pathname).toBe("/files/test/public.jpg");
  });
});

describe("기준 4. 권한", () => {
  it("범위 밖 403, 없는 물건 404, 회원 403, 비로그인 401", async () => {
    const other = await at(otherPlace);
    expect((await detail(guard, other.id)).status).toBe(403);
    expect((await patch(guard, other.id, { color: "검정" })).status).toBe(403);
    expect((await detail(guard, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await list(user.accessToken)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/found-items")).status).toBe(401);
  });
});

describe("기준 5. 검토 대기 → 등록: 속성 저장, 임베딩, 새 후보 알림", () => {
  it("등록하면 후보로 잡히고 신고한 사람에게 알림", async () => {
    const reportRes = await request(app)
      .post("/api/v1/lost-reports")
      .set(as(user.accessToken))
      .send({
        category: "UMBRELLA",
        lostFrom: hoursAgo(3).toISOString(),
        lostTo: hoursAgo(2).toISOString(),
        description: "검정 장우산",
      });
    const item = await at(null, { status: "REVIEW", category: null, description: undefined });
    await prisma.foundItemDetail.update({ where: { foundItemId: item.id }, data: { description: null } });
    await prisma.$executeRaw`UPDATE found_item_detail SET embedding = NULL WHERE found_item_id = ${item.id}::uuid`;

    const res = await patch(center, item.id, {
      category: "UMBRELLA",
      color: "검정",
      features: [{ key: "pattern", value: "체크무늬" }],
      description: "검정 장우산, 손잡이 체크무늬",
      status: "REGISTERED",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "REGISTERED", category: "UMBRELLA", color: "검정" });
    const [row] = await prisma.$queryRaw<
      { has: boolean }[]
    >`SELECT embedding IS NOT NULL AS has FROM found_item_detail WHERE found_item_id = ${item.id}::uuid`;
    expect(row?.has).toBe(true);
    const cands = await request(app)
      .get(`/api/v1/lost-reports/${reportRes.body.id}/candidates`)
      .set(as(user.accessToken));
    expect(cands.body.candidates.map((c: { foundItemId: string }) => c.foundItemId)).toEqual([item.id]);
    expect(await prisma.notification.count({ where: { userId: user.user.id, foundItemId: item.id } })).toBe(1);
  });
});

describe("기준 6. 등록 검증", () => {
  it("종류·설명 없이 등록 400, 검토 대기가 아닌 물건 등록 400, 빈 요청 400", async () => {
    const review = await at(guardPlace, { status: "REVIEW", category: null });
    await prisma.foundItemDetail.update({ where: { foundItemId: review.id }, data: { description: null } });
    expect((await patch(guard, review.id, { status: "REGISTERED" })).body.error.details[0].path).toBe("category");
    expect((await patch(guard, review.id, { status: "REGISTERED", category: "ETC" })).body.error.details[0].path).toBe(
      "description",
    );
    const registered = await at(guardPlace);
    expect((await patch(guard, registered.id, { status: "REGISTERED" })).status).toBe(400);
    expect((await patch(guard, registered.id, {})).status).toBe(400);
    expect((await patch(guard, registered.id, { status: "CLAIMED" })).status).toBe(400);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("REVIEW");
  });
});

describe("기준 7. 등록된 물건의 속성 고치기", () => {
  it("상태는 그대로, 설명이 바뀌면 임베딩도 바뀐다, 1·2순위 종류가 같으면 2순위는 비움", async () => {
    const item = await at(guardPlace, { status: "REVEALED", description: "옛 설명" });
    const before = await prisma.$queryRaw<
      { v: string }[]
    >`SELECT embedding::text AS v FROM found_item_detail WHERE found_item_id = ${item.id}::uuid`;
    const res = await patch(guard, item.id, { category: "CHARGER", categoryAlt: "CHARGER", description: "새 설명" });
    expect(res.body).toMatchObject({
      status: "REVEALED",
      category: "CHARGER",
      categoryAlt: null,
      description: "새 설명",
    });
    const after = await prisma.$queryRaw<
      { v: string }[]
    >`SELECT embedding::text AS v FROM found_item_detail WHERE found_item_id = ${item.id}::uuid`;
    expect(after[0]?.v).not.toBe(before[0]?.v);
  });

  it("설명을 안 바꾸면 임베딩을 다시 만들지 않는다", async () => {
    let embeds = 0;
    setAiClient({
      ...mockAiClient,
      embed: async (t) => {
        embeds++;
        return mockAiClient.embed(t);
      },
    });
    const item = await at(guardPlace);
    embeds = 0;
    await patch(guard, item.id, { color: "검정" }).expect(200);
    expect(embeds).toBe(0);
  });
});

describe("기준 8. 임베딩이 실패하면 아무것도 바꾸지 않는다", () => {
  it("502, 상태·속성 그대로", async () => {
    setAiClient({ ...mockAiClient, embed: async () => Promise.reject(new Error("AI 장애")) });
    const item = await at(guardPlace, { status: "REVIEW", category: null });
    const res = await patch(guard, item.id, { category: "ETC", description: "무언가", status: "REGISTERED" });
    expect(res.status).toBe(502);
    const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after).toMatchObject({ status: "REVIEW", category: null });
  });
});

describe("기준 9. 경비실 관리자도 자기 보관처의 검토 대기는 처리할 수 있다", () => {
  it("자기 보관처 REVIEW → REGISTERED", async () => {
    const item = await at(guardPlace, { status: "REVIEW", category: null });
    const res = await patch(guard, item.id, { category: "WALLET", description: "갈색 반지갑", status: "REGISTERED" });
    expect(res.body.status).toBe("REGISTERED");
  });
});

describe("기준 10. 관리자 응답에도 지문 해시와 전체 이메일은 없다", () => {
  it("목록·상세 모두", async () => {
    const item = await at(guardPlace);
    await prisma.foundItem.update({ where: { id: item.id }, data: { uploaderFingerprint: "f".repeat(64) } });
    await createAttempt(user.user.id, item.id, { result: "FAIL" });
    for (const res of [await list(guard), await detail(guard, item.id)]) {
      const text = JSON.stringify(res.body);
      expect(text).not.toContain("f".repeat(64));
      expect(text).not.toContain("student@skuniv.ac.kr");
      expect(text).not.toMatch(/fingerprint|passwordHash|qrTokenHash/);
    }
  });
});
