// F-10 사진·보관 위치 공개, F-12 열람 기록: 이슈의 완료 기준 10개
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { createAdmin, demoLogin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let user: { accessToken: string; user: { id: string } };

const detail = (id: string, t = user.accessToken) =>
  request(app).get(`/api/v1/found-items/${id}/detail`).set("Authorization", `Bearer ${t}`);

async function handedOverItem(over: Partial<Parameters<typeof createFoundItem>[0]> = {}) {
  const place = await createStoragePlace(`경비실-${Math.random().toString(36).slice(2, 6)}`, A);
  const item = await createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    color: "흰색",
    brand: "Apple",
    features: [{ key: "sticker", value: "곰돌이 스티커" }],
    description: "흰색 에어팟",
    foundAt: hoursAgo(1),
    storageType: "HANDED_OVER",
    storagePlaceId: place.id,
    ...over,
  });
  return { item, place };
}

beforeEach(async () => {
  await resetDb();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  user = await signupUser(app);
});

describe("기준 1. 통과한 계정만 볼 수 있다", () => {
  it("PASS면 200", async () => {
    const { item } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    expect((await detail(item.id)).status).toBe(200);
  });

  it("시도 없음·FAIL·답하지 않은 경계·오답은 403", async () => {
    const cases = [
      null,
      { result: "FAIL" },
      { result: "BORDERLINE" },
      { result: "BORDERLINE", answerCorrect: false },
    ] as const;
    for (const c of cases) {
      const { item } = await handedOverItem();
      if (c) await createAttempt(user.user.id, item.id, c);
      const res = await detail(item.id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });
});

describe("기준 2. 확인 질문을 맞힌 계정도 볼 수 있다", () => {
  it("경계 + 정답이면 200", async () => {
    const { item } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "BORDERLINE", answerCorrect: true });
    expect((await detail(item.id)).status).toBe(200);
  });
});

describe("기준 3. 응답에는 공개할 정보만", () => {
  it("색·건물·보관처 안내는 있고, 브랜드·특징·설명·원본 경로·지문은 없다", async () => {
    const { item, place } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    const res = await detail(item.id);
    expect(res.body).toMatchObject({
      id: item.id,
      category: "EARPHONE",
      color: "흰색",
      building: { id: A, name: "혜인관" },
      storageType: "HANDED_OVER",
      storagePlace: { id: place.id, name: place.name, guideText: place.guideText },
      isSeed: false,
    });
    const text = JSON.stringify(res.body);
    for (const secret of ["Apple", "곰돌이", "흰색 에어팟", "original", "features", "fingerprint"])
      expect(text).not.toContain(secret);
  });
});

describe("기준 4. 사진 링크는 공개본을 가리키고 10분 뒤 만료된다", () => {
  it("public 파일 서명, 만료 시각 약 10분", async () => {
    const { item } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    const res = await detail(item.id);
    const url = new URL(res.body.imageUrl);
    expect(url.pathname).toBe("/files/test/public.jpg");
    const exp = Number(url.searchParams.get("exp")) * 1000;
    expect(exp - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(exp - Date.now()).toBeLessThanOrEqual(10 * 60_000 + 1000);
    expect(Math.abs(Date.parse(res.body.imageUrlExpiresAt) - exp)).toBeLessThan(2000);
  });
});

describe("기준 5. 볼 때마다 열람 기록이 남는다", () => {
  it("세 번 보면 세 줄, 통과한 시도와 연결", async () => {
    const { item } = await handedOverItem();
    const pass = await createAttempt(user.user.id, item.id, { result: "PASS" });
    for (let i = 0; i < 3; i++) await detail(item.id).expect(200);
    const logs = await prisma.revealLog.findMany({ where: { foundItemId: item.id } });
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => l.userId === user.user.id && l.matchAttemptId === pass.id)).toBe(true);
  });

  it("거부된 요청은 기록하지 않는다", async () => {
    const { item } = await handedOverItem();
    await detail(item.id).expect(403);
    expect(await prisma.revealLog.count()).toBe(0);
  });
});

describe("기준 6. 처음 공개되면 등록됨 → 열람됨", () => {
  it("REGISTERED → REVEALED, 다른 상태는 그대로", async () => {
    const { item } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    expect((await detail(item.id)).body.status).toBe("REVEALED");
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REVEALED");

    const { item: claimed } = await handedOverItem({ status: "CLAIMED" });
    await createAttempt(user.user.id, claimed.id, { result: "PASS" });
    expect((await detail(claimed.id)).body.status).toBe("CLAIMED");
  });
});

describe("기준 7. 체험 계정은 기록만 남기고 시드 상태는 그대로", () => {
  it("시드는 REGISTERED 유지, 열람 기록은 남음", async () => {
    const { item } = await handedOverItem({ isSeed: true });
    const demo = await demoLogin(app);
    await createAttempt(demo.user.id, item.id, { result: "PASS" });
    const res = await detail(item.id, demo.accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "REGISTERED", isSeed: true });
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REGISTERED");
    expect(await prisma.revealLog.count({ where: { userId: demo.user.id } })).toBe(1);
  });
});

describe("기준 8. 권한", () => {
  it("다른 계정의 통과로는 볼 수 없다, 비로그인 401, 관리자 403, 없는 물건 404, 잘못된 id 400", async () => {
    const { item } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    const other = await signupUser(app, "other@skuniv.ac.kr");
    expect((await detail(item.id, other.accessToken)).status).toBe(403);
    expect((await request(app).get(`/api/v1/found-items/${item.id}/detail`)).status).toBe(401);
    await createAdmin("admin@skuniv.ac.kr", "adminpass1");
    const admin = await request(app)
      .post("/api/v1/admin/auth/login")
      .send({ email: "admin@skuniv.ac.kr", password: "adminpass1" });
    expect((await detail(item.id, admin.body.accessToken)).status).toBe(403);
    expect((await detail("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await detail("nope")).status).toBe(400);
  });
});

describe("기준 9. 여러 계정이 열람하면 맡은 관리자에게 알린다", () => {
  it("두 번째 계정이 처음 볼 때 보관처 관리자에게 한 번, 같은 계정이 다시 봐도 추가 알림 없음", async () => {
    const { item, place } = await handedOverItem();
    const guard = await createAdmin("guard@skuniv.ac.kr", "adminpass1", place.id);
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    await createAttempt(other.user.id, item.id, { result: "PASS" });

    await detail(item.id).expect(200);
    expect(await prisma.notification.count()).toBe(0);
    await detail(item.id, other.accessToken).expect(200);
    await detail(item.id, other.accessToken).expect(200);
    const notes = await prisma.notification.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: guard.id, type: "MULTI_REVEAL", foundItemId: item.id });
    expect(notes[0]?.message).toContain("혜인관의 무선 이어폰을 2개 계정이 확인했어요.");
    expect(notes[0]?.message).not.toMatch(/흰색|Apple|곰돌이/);
  });

  it("보관처가 없으면 종합서비스센터 관리자에게, 체험 계정 열람은 세지 않는다", async () => {
    const center = await createStoragePlace("종합서비스센터", A, "CENTER");
    const centerAdmin = await createAdmin("center@skuniv.ac.kr", "adminpass1", center.id);
    const item = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1), isSeed: true });
    const demo = await demoLogin(app);
    await createAttempt(demo.user.id, item.id, { result: "PASS" });
    await detail(item.id, demo.accessToken).expect(200);

    const real = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const other = await signupUser(app, "other@skuniv.ac.kr");
    await createAttempt(user.user.id, real.id, { result: "PASS" });
    await createAttempt(other.user.id, real.id, { result: "PASS" });
    await detail(real.id).expect(200);
    await detail(real.id, other.accessToken).expect(200);
    const notes = await prisma.notification.findMany();
    expect(notes.map((n) => [n.userId, n.foundItemId])).toEqual([[centerAdmin.id, real.id]]);
  });
});

describe("기준 10. 동시에 열람해도 상태 전환과 기록이 정확하다", () => {
  // 주의: 테스트 환경에서는 두 요청이 실제로 겹치지 않아 잠금이 없어도 통과한다(직접 확인함).
  // 경합 자체를 재현하지는 못하고, 동시 요청에서 알림이 중복·누락되지 않는지만 확인한다.
  it("서로 다른 두 계정이 동시에 처음 열어도 알림은 정확히 한 번", async () => {
    for (let round = 0; round < 5; round++) {
      await prisma.notification.deleteMany();
      const { item, place } = await handedOverItem();
      await createAdmin(`guard${round}@skuniv.ac.kr`, "adminpass1", place.id);
      const other = await signupUser(app, `other${round}@skuniv.ac.kr`);
      await createAttempt(user.user.id, item.id, { result: "PASS" });
      await createAttempt(other.user.id, item.id, { result: "PASS" });
      await Promise.all([detail(item.id), detail(item.id, other.accessToken)]);
      expect(await prisma.notification.count({ where: { foundItemId: item.id } })).toBe(1);
    }
  });

  it("동시 5번 → 기록 5줄, REVEALED 한 번", async () => {
    const { item } = await handedOverItem();
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    const results = await Promise.all(Array.from({ length: 5 }, () => detail(item.id)));
    expect(results.every((r) => r.status === 200 && r.body.status === "REVEALED")).toBe(true);
    expect(await prisma.revealLog.count()).toBe(5);
  });
});
