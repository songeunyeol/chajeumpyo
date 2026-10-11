// F-13 앱 내 알림: 이슈의 완료 기준 10개
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import * as alerts from "../../src/services/candidate-alerts";
import { createAdmin, demoLogin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";
import { noisyJpeg } from "../helpers/images";

let app: ReturnType<typeof createApp>;
let A: number;
let user: Awaited<ReturnType<typeof signupUser>>;
let image: Buffer;
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

/** 등록 API로 습득물 등록 (mock AI: 무선 이어폰, 2순위 충전기) */
async function registerItem(ua = `ua-${Math.random()}`) {
  const res = await request(app)
    .post("/api/v1/found-items")
    .set("User-Agent", ua)
    .field("buildingId", String(A))
    .field("storageType", "IN_PLACE")
    .attach("image", image, "p.jpg");
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function report(category: string, t = user.accessToken, over: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/lost-reports")
    .set(as(t))
    .send({
      category,
      lostFrom: hoursAgo(3).toISOString(),
      lostTo: hoursAgo(2).toISOString(),
      description: `${category} 잃어버렸어요`,
      ...over,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const inbox = (t = user.accessToken) => request(app).get("/api/v1/notifications").set(as(t));

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  user = await signupUser(app);
  image ??= await noisyJpeg();
});

afterEach(() => resetAiClient());

describe("기준 1. 새 습득물이 내 신고의 후보가 되면 알림", () => {
  it("NEW_CANDIDATE, 신고·물건 연결, 공개 정보만", async () => {
    const r = await report("EARPHONE");
    const itemId = await registerItem();
    const n = await prisma.notification.findMany();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ userId: user.user.id, type: "NEW_CANDIDATE", lostReportId: r, foundItemId: itemId });
    expect(n[0]?.message).toBe("혜인관에서 무선 이어폰이(가) 새로 등록됐어요.");
    expect(n[0]?.message).not.toMatch(/흰색|Apple|곰돌이/);
  });
});

describe("기준 2. 연관 종류·2순위 종류도 알리고, 관련 없는 종류는 알리지 않는다", () => {
  it("충전기 신고(연관)·노트북 신고(2순위의 연관)는 알림, 우산 신고는 없음", async () => {
    const charger = await report("CHARGER");
    const laptop = await report("LAPTOP_TABLET");
    await report("UMBRELLA");
    await registerItem();
    const ids = (await prisma.notification.findMany()).map((n) => n.lostReportId).sort();
    expect(ids).toEqual([charger, laptop].sort());
  });
});

describe("기준 3. 닫힌 신고, 후보 상위 5개에 못 드는 경우는 알리지 않는다", () => {
  it("닫힌 신고 X, 더 잘 맞는 후보 5개가 이미 있으면 X", async () => {
    const closed = await report("EARPHONE");
    await request(app).patch(`/api/v1/lost-reports/${closed}`).set(as(user.accessToken)).send({ status: "CLOSED" });

    const B = (await createBuilding("청운관")).id;
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await report("EARPHONE", other.accessToken, { buildingId: B });
    for (let i = 0; i < 5; i++) {
      await createFoundItem({
        buildingId: B,
        category: "EARPHONE",
        foundAt: hoursAgo(1.5),
        description: "EARPHONE 잃어버렸어요",
      });
    }
    await registerItem(); // 혜인관 등록 → 청운관 신고의 상위 5개 밖
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("기준 4. 시드·체험 분리, 검토 대기 등록은 알리지 않는다", () => {
  it("일반 등록은 체험 계정 신고에 알리지 않는다", async () => {
    const demo = await demoLogin(app);
    await report("EARPHONE", demo.accessToken);
    await registerItem();
    expect(await prisma.notification.count()).toBe(0);
  });

  it("시드 물건은 체험 계정 신고에만", async () => {
    const demo = await demoLogin(app);
    const demoReport = await report("EARPHONE", demo.accessToken);
    await report("EARPHONE");
    const seed = await createFoundItem({ buildingId: A, category: "EARPHONE", isSeed: true, foundAt: new Date() });
    expect(await alerts.alertNewCandidate(seed.id)).toBe(1);
    expect((await prisma.notification.findFirstOrThrow()).lostReportId).toBe(demoReport);
  });

  it("AI 실패로 검토 대기가 되면 알림 없음", async () => {
    await report("EARPHONE");
    setAiClient({ ...mockAiClient, extractFoundItem: async () => Promise.reject(new Error("AI 장애")) });
    await registerItem();
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("기준 5. 신고마다 한 번씩, 중복 없이", () => {
  it("신고 두 개면 두 개, 같은 물건으로 다시 돌려도 추가 없음", async () => {
    await report("EARPHONE");
    await report("EARPHONE", user.accessToken, { description: "두 번째 이어폰 신고" });
    const itemId = await registerItem();
    expect(await prisma.notification.count()).toBe(2);
    expect(await alerts.alertNewCandidate(itemId)).toBe(0);
    expect(await prisma.notification.count()).toBe(2);
  });
});

describe("기준 6. 알림이 실패해도 등록은 성공", () => {
  it("알림 단계에서 DB 오류가 나도 201", async () => {
    await report("EARPHONE");
    const original = prisma.notification.create;
    prisma.notification.create = (() => Promise.reject(new Error("알림 저장 실패"))) as never;
    try {
      const id = await registerItem();
      expect((await prisma.foundItem.findUniqueOrThrow({ where: { id } })).status).toBe("REGISTERED");
      expect(await prisma.notification.count()).toBe(0); // 실제로 알림 저장이 실패했는지
    } finally {
      prisma.notification.create = original;
    }
  });
});

describe("기준 7. 내 알림만 최신순, 안 읽은 수", () => {
  it("다른 사람 알림은 안 보인다", async () => {
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await prisma.notification.createMany({
      data: [
        { userId: user.user.id, type: "SYSTEM", message: "첫째", createdAt: hoursAgo(2) },
        { userId: user.user.id, type: "SYSTEM", message: "둘째", createdAt: hoursAgo(1), readAt: new Date() },
        { userId: user.user.id, type: "SYSTEM", message: "셋째", createdAt: hoursAgo(0.5) },
        { userId: other.user.id, type: "SYSTEM", message: "남의 것" },
      ],
    });
    const res = await inbox();
    expect(res.body.notifications.map((n: { message: string }) => n.message)).toEqual(["셋째", "둘째", "첫째"]);
    expect(res.body.unreadCount).toBe(2);
  });

  it("최대 50개", async () => {
    await prisma.notification.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({ userId: user.user.id, type: "SYSTEM" as const, message: `${i}` })),
    });
    const res = await inbox();
    expect(res.body.notifications).toHaveLength(50);
    expect(res.body.unreadCount).toBe(60);
  });
});

describe("기준 8. 읽음 처리", () => {
  it("하나 읽기, 다시 읽어도 204, 남의 알림 404, 모두 읽기", async () => {
    const other = await signupUser(app, "other@skuniv.ac.kr");
    const mine = await prisma.notification.create({ data: { userId: user.user.id, type: "SYSTEM", message: "a" } });
    await prisma.notification.create({ data: { userId: user.user.id, type: "SYSTEM", message: "b" } });
    const theirs = await prisma.notification.create({ data: { userId: other.user.id, type: "SYSTEM", message: "c" } });
    const read = (id: string) => request(app).patch(`/api/v1/notifications/${id}/read`).set(as(user.accessToken));

    expect((await read(mine.id)).status).toBe(204);
    const firstReadAt = (await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt;
    expect((await read(mine.id)).status).toBe(204);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).toEqual(firstReadAt);
    expect((await read(theirs.id)).status).toBe(404);
    expect((await inbox()).body.unreadCount).toBe(1);

    await request(app).patch("/api/v1/notifications/read-all").set(as(user.accessToken)).expect(204);
    expect((await inbox()).body.unreadCount).toBe(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });
});

describe("기준 9. 관리자도 자기 알림을 본다, 비로그인 401", () => {
  it("여러 계정 열람 알림을 관리자가 조회", async () => {
    const place = await createStoragePlace("혜인관 경비실", A);
    await createAdmin("guard@skuniv.ac.kr", "adminpass1", place.id);
    const admin = (
      await request(app).post("/api/v1/admin/auth/login").send({ email: "guard@skuniv.ac.kr", password: "adminpass1" })
    ).body;
    const item = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      storageType: "HANDED_OVER",
      storagePlaceId: place.id,
      foundAt: hoursAgo(1),
    });
    const other = await signupUser(app, "other@skuniv.ac.kr");
    for (const u of [user, other]) {
      await createAttempt(u.user.id, item.id, { result: "PASS" });
      await request(app).get(`/api/v1/found-items/${item.id}/detail`).set(as(u.accessToken)).expect(200);
    }
    const res = await inbox(admin.accessToken);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ type: "MULTI_REVEAL", foundItemId: item.id });
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
  });
});

describe("기준 10. 알림 응답에는 공개 정보만", () => {
  it("필드가 정해진 것뿐", async () => {
    await report("EARPHONE");
    await registerItem();
    const n = (await inbox()).body.notifications[0];
    expect(Object.keys(n).sort()).toEqual([
      "createdAt",
      "foundItemId",
      "id",
      "lostReportId",
      "message",
      "readAt",
      "type",
    ]);
    expect(JSON.stringify(n)).not.toMatch(/흰색|Apple|곰돌이|userId/);
  });
});
