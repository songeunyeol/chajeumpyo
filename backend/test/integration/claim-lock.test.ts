// 확인 시도 잠금 (#29): 계정당 3회 + 물건별 모든 계정 실패 10회면 대면 확인. 이슈의 완료 기준 10개
import type { AiFeature, LostReportExtraction } from "@chajeumpyo/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import { signAccessToken } from "../../src/lib/tokens";
import { createAdmin, demoLogin } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let place: number;
let compareCalls: number;
let judgeCalls: number;
let nextExtraction: Partial<LostReportExtraction> = {};
let userSeq = 0;

const STORED: AiFeature[] = [
  { key: "sticker", value: "곰돌이 스티커" },
  { key: "scratch", value: "오른쪽 아래 긁힘" },
];
const WRONG = { features: [{ key: "sticker", value: "토끼" }] } satisfies Partial<LostReportExtraction>;
const RIGHT = { features: [{ key: "sticker", value: "곰돌이 스티커" }] } satisfies Partial<LostReportExtraction>;
// 스티커는 안 적고 긁힘만 다르게 → 모순 없이 맞는 것도 없어 확인 질문(스티커)
const BORDER = {
  color: "BLACK",
  features: [{ key: "scratch", value: "오른쪽 아래" }],
} satisfies Partial<LostReportExtraction>;

/** 가입 절차 없이 계정과 토큰을 만든다 (가입 횟수 제한을 피하려고) */
async function newUser(role: "USER" | "DEMO" = "USER") {
  const u = await prisma.user.create({ data: { email: `u${++userSeq}@skuniv.ac.kr`, passwordHash: "x", role } });
  return { id: u.id, token: signAccessToken(u.id, role, 1).token };
}

async function newItem(over: Partial<Parameters<typeof createFoundItem>[0]> = {}) {
  return createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    color: "WHITE",
    brand: "Apple",
    features: STORED,
    foundAt: hoursAgo(1),
    storageType: "HANDED_OVER",
    storagePlaceId: place,
    ...over,
  });
}

async function newReport(token: string, extraction: Partial<LostReportExtraction>) {
  nextExtraction = extraction;
  const res = await request(app)
    .post("/api/v1/lost-reports")
    .set("Authorization", `Bearer ${token}`)
    .send({
      category: "EARPHONE",
      lostFrom: hoursAgo(3).toISOString(),
      lostTo: hoursAgo(2).toISOString(),
      buildingId: A,
      description: `흰색 에어팟 ${Math.random()}`,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

const claim = (token: string, reportId: string, foundItemId: string) =>
  request(app)
    .post(`/api/v1/lost-reports/${reportId}/claims`)
    .set("Authorization", `Bearer ${token}`)
    .send({ foundItemId });
const answer = (token: string, attemptId: string, text: string) =>
  request(app)
    .post(`/api/v1/claims/${attemptId}/answer`)
    .set("Authorization", `Bearer ${token}`)
    .send({ answer: text });

/** 다른 계정들의 실패를 n개 깔아 둔다 (계정마다 1번씩) */
async function failuresFromOthers(foundItemId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const u = await newUser();
    await createAttempt(
      u.id,
      foundItemId,
      i % 2 === 0 ? { result: "FAIL" } : { result: "BORDERLINE", answerCorrect: false },
    );
  }
}

/** 새 계정으로 실패 한 번 */
async function failOnce(foundItemId: string) {
  const u = await newUser();
  return claim(u.token, await newReport(u.token, WRONG), foundItemId);
}

const lockedAt = async (id: string) => (await prisma.foundItem.findUniqueOrThrow({ where: { id } })).claimLockedAt;
const failureCount = (foundItemId: string) =>
  prisma.matchAttempt.count({ where: { foundItemId, OR: [{ result: "FAIL" }, { answerCorrect: false }] } });

beforeEach(async () => {
  await resetDb();
  compareCalls = 0;
  judgeCalls = 0;
  setAiClient({
    ...mockAiClient,
    extractLostReport: async (description) => ({
      category: "EARPHONE",
      color: null,
      brand: null,
      features: [],
      description,
      ...nextExtraction,
    }),
    compareFeatures: async (...args) => {
      compareCalls++;
      return mockAiClient.compareFeatures(...args);
    },
    judgeAnswer: async (input) => {
      judgeCalls++;
      return mockAiClient.judgeAnswer(input);
    },
  });
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  place = (await createStoragePlace("혜인관 경비실", A)).id;
});

afterEach(() => resetAiClient());

describe("기준 1. 계정당 3회면 그 계정만 잠긴다", () => {
  it("X는 409 MATCH_LOCKED, Y는 계속 시도", async () => {
    const item = await newItem();
    const x = await newUser();
    for (let i = 0; i < 3; i++)
      expect((await claim(x.token, await newReport(x.token, WRONG), item.id)).body.result).toBe("FAIL");
    const locked = await claim(x.token, await newReport(x.token, WRONG), item.id);
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("MATCH_LOCKED");
    const y = await failOnce(item.id);
    expect(y.body).toMatchObject({ result: "FAIL", attemptsLeft: 2, inPersonOnly: false });
    expect(await lockedAt(item.id)).toBeNull();
  });
});

describe("기준 2·6. 모든 계정 실패 합계 10회면 물건을 잠근다", () => {
  it("9회까지는 열려 있고, 10번째 판정 실패로 잠긴다. 그 응답은 attemptsLeft 0, inPersonOnly", async () => {
    const item = await newItem();
    await failuresFromOthers(item.id, 8);
    expect((await failOnce(item.id)).body.inPersonOnly).toBe(false); // 9번째
    expect(await lockedAt(item.id)).toBeNull();
    const tenth = await failOnce(item.id);
    expect(tenth.body).toMatchObject({ result: "FAIL", attemptsLeft: 0, inPersonOnly: true });
    expect(Date.now() - ((await lockedAt(item.id))?.getTime() ?? 0)).toBeLessThan(10_000);
  });

  it("10번째가 확인 질문 오답이어도 잠긴다", async () => {
    const item = await newItem();
    await failuresFromOthers(item.id, 9);
    const u = await newUser();
    const q = await claim(u.token, await newReport(u.token, BORDER), item.id);
    expect(q.body.result).toBe("BORDERLINE");
    const res = await answer(u.token, q.body.attemptId, "토끼");
    expect(res.body).toEqual({ result: "FAIL", attemptsLeft: 0, inPersonOnly: true });
    expect(await lockedAt(item.id)).not.toBeNull();
  });
});

describe("기준 3. 잠긴 물건은 새 판정을 막는다", () => {
  it("실패 0회 계정도 409 IN_PERSON_REQUIRED, AI 안 부르고 시도도 안 생긴다", async () => {
    const item = await newItem();
    await failuresFromOthers(item.id, 9);
    await failOnce(item.id);
    const before = await prisma.matchAttempt.count();
    compareCalls = 0;
    const fresh = await newUser();
    const res = await claim(fresh.token, await newReport(fresh.token, RIGHT), item.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IN_PERSON_REQUIRED");
    expect(compareCalls).toBe(0);
    expect(await prisma.matchAttempt.count()).toBe(before);
  });
});

describe("기준 4. 잠긴 물건의 안 답한 질문에 답해도 막는다", () => {
  it("409, 답 저장 안 됨, 답 판정 AI 안 부름", async () => {
    const item = await newItem();
    await failuresFromOthers(item.id, 9);
    const z = await newUser();
    const q = await claim(z.token, await newReport(z.token, BORDER), item.id);
    expect(q.body.result).toBe("BORDERLINE");
    await failOnce(item.id); // 다른 계정의 10번째 실패로 잠김
    expect(await lockedAt(item.id)).not.toBeNull();
    const res = await answer(z.token, q.body.attemptId, "곰돌이");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IN_PERSON_REQUIRED");
    expect(judgeCalls).toBe(0);
    expect((await prisma.matchAttempt.findUniqueOrThrow({ where: { id: q.body.attemptId } })).answerCorrect).toBeNull();
  });
});

describe("기준 5. 잠기기 전에 통과한 계정은 그대로", () => {
  it("다시 눌러도 PASS, 상세도 볼 수 있다", async () => {
    const item = await newItem();
    const p = await newUser();
    const pr = await newReport(p.token, RIGHT);
    expect((await claim(p.token, pr, item.id)).body.result).toBe("PASS");
    await failuresFromOthers(item.id, 9);
    await failOnce(item.id);
    expect(await lockedAt(item.id)).not.toBeNull();
    expect((await claim(p.token, pr, item.id)).body).toMatchObject({ result: "PASS", reused: true });
    const detail = await request(app)
      .get(`/api/v1/found-items/${item.id}/detail`)
      .set("Authorization", `Bearer ${p.token}`);
    expect(detail.status).toBe(200);
  });
});

describe("기준 7. 잠길 때 맡은 관리자에게 한 번만 알린다", () => {
  it("보관처 관리자만, CLAIM_LOCKED 1건, 공개 정보만", async () => {
    const guard = await createAdmin("guard@skuniv.ac.kr", "adminpass1", place);
    const centerPlace = (await createStoragePlace("종합서비스센터", A, "CENTER")).id;
    const center = await createAdmin("center@skuniv.ac.kr", "adminpass1", centerPlace);
    const item = await newItem();
    await failuresFromOthers(item.id, 9);
    await failOnce(item.id);
    for (let i = 0; i < 2; i++) expect((await failOnce(item.id)).status).toBe(409);

    const notes = await prisma.notification.findMany({ where: { type: "CLAIM_LOCKED" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: guard.id, foundItemId: item.id });
    expect(notes[0]?.message).toContain("혜인관의 무선 이어폰");
    expect(notes[0]?.message).toContain("직접 본인 확인");
    expect(notes[0]?.message).not.toMatch(/곰돌이|긁힘|WHITE|Apple|토끼/);
    expect(await prisma.notification.count({ where: { userId: center.id } })).toBe(0);
  });

  it("보관처 관리자가 없으면(그 자리에 둠) 종합서비스센터 관리자", async () => {
    const centerPlace = (await createStoragePlace("종합서비스센터", A, "CENTER")).id;
    const center = await createAdmin("center@skuniv.ac.kr", "adminpass1", centerPlace);
    const item = await newItem({ storageType: "IN_PLACE", storagePlaceId: null });
    await failuresFromOthers(item.id, 9);
    await failOnce(item.id);
    expect(await prisma.notification.findMany({ where: { type: "CLAIM_LOCKED" }, select: { userId: true } })).toEqual([
      { userId: center.id },
    ]);
  });
});

describe("기준 8. 동시에 실패해도 10회를 넘지 않고 알림은 한 번", () => {
  it("9회 상태에서 4개 계정이 동시에", async () => {
    await createAdmin("guard@skuniv.ac.kr", "adminpass1", place);
    const item = await newItem();
    await failuresFromOthers(item.id, 9);
    const users = await Promise.all([1, 2, 3, 4].map(() => newUser()));
    const reports: string[] = [];
    for (const u of users) reports.push(await newReport(u.token, WRONG));
    const results = await Promise.all(users.map((u, i) => claim(u.token, reports[i] ?? "", item.id)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409]);
    expect(results.find((r) => r.status === 200)?.body.inPersonOnly).toBe(true);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe("IN_PERSON_REQUIRED");
    expect(await failureCount(item.id)).toBe(10);
    expect(await prisma.notification.count({ where: { type: "CLAIM_LOCKED" } })).toBe(1);
  });
});

describe("기준 9. 후보 목록과 관리자 화면에 잠김 표시", () => {
  it("후보: locked·inPersonOnly·attemptsLeft 0, 관리자 목록·상세: claimLockedAt", async () => {
    const item = await newItem();
    const open = await newItem({ foundAt: hoursAgo(1.5) });
    await failuresFromOthers(item.id, 9);
    await failOnce(item.id);

    const u = await newUser();
    const r = await newReport(u.token, WRONG);
    const cands = await request(app)
      .get(`/api/v1/lost-reports/${r}/candidates`)
      .set("Authorization", `Bearer ${u.token}`);
    const byId = new Map(cands.body.candidates.map((c: { foundItemId: string }) => [c.foundItemId, c]));
    expect(byId.get(item.id)).toMatchObject({ locked: true, inPersonOnly: true, attemptsLeft: 0 });
    expect(byId.get(open.id)).toMatchObject({ locked: false, inPersonOnly: false, attemptsLeft: 3 });

    await createAdmin("guard@skuniv.ac.kr", "adminpass1", place);
    const admin = (
      await request(app).post("/api/v1/admin/auth/login").send({ email: "guard@skuniv.ac.kr", password: "adminpass1" })
    ).body.accessToken as string;
    const list = await request(app).get("/api/v1/admin/found-items").set("Authorization", `Bearer ${admin}`);
    const row = list.body.items.find((i: { id: string }) => i.id === item.id);
    expect(row.claimLockedAt).toBe((await lockedAt(item.id))?.toISOString());
    expect(list.body.items.find((i: { id: string }) => i.id === open.id).claimLockedAt).toBeNull();
    const detail = await request(app)
      .get(`/api/v1/admin/found-items/${item.id}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(detail.body.claimLockedAt).toBe(row.claimLockedAt);
  });
});

describe("기준 10. 체험용 시드는 물건 단위로 잠그지 않는다", () => {
  it("실패가 10회를 넘어도 체험 계정은 계속 시도, 계정당 3회는 그대로", async () => {
    const seed = await newItem({ isSeed: true });
    for (let i = 0; i < 10; i++) {
      const d = await newUser("DEMO");
      await createAttempt(d.id, seed.id, { result: "FAIL" });
    }
    const demo = await demoLogin(app);
    const first = await claim(demo.accessToken, await newReport(demo.accessToken, WRONG), seed.id);
    expect(first.body).toMatchObject({ result: "FAIL", attemptsLeft: 2, inPersonOnly: false });
    expect(await lockedAt(seed.id)).toBeNull();
    for (let i = 0; i < 2; i++) await claim(demo.accessToken, await newReport(demo.accessToken, WRONG), seed.id);
    const locked = await claim(demo.accessToken, await newReport(demo.accessToken, WRONG), seed.id);
    expect(locked.body.error.code).toBe("MATCH_LOCKED");
    expect(await prisma.notification.count({ where: { type: "CLAIM_LOCKED" } })).toBe(0);
  });
});
