// F-06 분실 신고, F-07 후보 조회: 이슈의 완료 기준 10개
import type { LostReportExtraction } from "@chajeumpyo/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { EMBEDDING_DIM } from "../../src/ai/types";
import { createApp } from "../../src/app";
import { createAdmin, demoLogin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createBuilding, createFoundItem, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let token: string;
let A: number;
let B: number;
const auth = () => ({ Authorization: `Bearer ${token}` });
const DESC = "흰색 에어팟 프로, 케이스에 곰돌이 스티커";

function report(over: Record<string, unknown> = {}) {
  return {
    category: "EARPHONE",
    lostFrom: hoursAgo(3).toISOString(),
    lostTo: hoursAgo(2).toISOString(),
    buildingId: A,
    description: DESC,
    ...over,
  };
}
const post = (body: object, t = token) =>
  request(app).post("/api/v1/lost-reports").set("Authorization", `Bearer ${t}`).send(body);

function useExtraction(fn: (description: string) => Promise<LostReportExtraction>) {
  setAiClient({ ...mockAiClient, extractLostReport: fn });
}

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  B = (await createBuilding("청운관")).id;
  token = (await signupUser(app)).accessToken;
  // 신고 설명에서 색을 뽑아 주는 추출기 (mock 기본은 색을 비워 둔다)
  useExtraction(async (description) => ({
    category: "EARPHONE",
    color: description.includes("흰색") ? "WHITE" : null,
    brand: null,
    features: [{ key: "sticker", value: "곰돌이 스티커" }],
    description,
  }));
});

afterEach(() => resetAiClient());

describe("기준 1. 신고를 저장하고 후보를 함께 준다", () => {
  it("201, 추출 속성·설명 해시·임베딩 저장", async () => {
    const item = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const res = await post(report());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.candidates.map((c: { foundItemId: string }) => c.foundItemId)).toEqual([item.id]);

    const saved = await prisma.lostReport.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved).toMatchObject({ category: "EARPHONE", buildingId: A, description: DESC });
    expect(saved.descriptionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.extractedAttributes).toMatchObject({ color: "WHITE" });
    const [row] = await prisma.$queryRaw<
      { dims: number }[]
    >`SELECT vector_dims(embedding) AS dims FROM lost_report WHERE id = ${res.body.id}::uuid`;
    expect(row?.dims).toBe(EMBEDDING_DIM);
  });

  it("건물을 모르면 생략할 수 있다", async () => {
    const res = await post(report({ buildingId: undefined }));
    expect(res.status).toBe(201);
  });
});

describe("기준 2. 입력 검증과 권한", () => {
  it("시간 순서가 거꾸로이거나 미래면 400", async () => {
    expect(
      (await post(report({ lostFrom: hoursAgo(1).toISOString(), lostTo: hoursAgo(2).toISOString() }))).status,
    ).toBe(400);
    expect((await post(report({ lostTo: new Date(Date.now() + 3600_000).toISOString() }))).status).toBe(400);
  });

  it("없는 건물, 너무 짧은 설명, 없는 종류는 400", async () => {
    expect((await post(report({ buildingId: 9999 }))).status).toBe(400);
    expect((await post(report({ description: "폰" }))).status).toBe(400);
    expect((await post(report({ category: "CARD" }))).status).toBe(400);
    expect(await prisma.lostReport.count()).toBe(0);
  });

  it("비로그인 401, 관리자 403", async () => {
    expect((await request(app).post("/api/v1/lost-reports").send(report())).status).toBe(401);
    await createAdmin("admin@skuniv.ac.kr", "adminpass1");
    const admin = await request(app)
      .post("/api/v1/admin/auth/login")
      .send({ email: "admin@skuniv.ac.kr", password: "adminpass1" });
    expect((await post(report(), admin.body.accessToken)).status).toBe(403);
  });
});

describe("기준 3. AI 분석이 실패하면 502, 저장하지 않는다", () => {
  it("한 번 재시도 후 실패하면 502 AI_UNAVAILABLE", async () => {
    let calls = 0;
    useExtraction(async () => {
      calls++;
      throw new Error("AI 장애");
    });
    const res = await post(report());
    expect(calls).toBe(2);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(await prisma.lostReport.count()).toBe(0);
  });

  it("AI 응답 형식이 계약과 다르거나(허용 밖 색) 임베딩 차원이 틀려도 502", async () => {
    useExtraction(async (description) => ({
      category: "EARPHONE",
      color: "파란색" as never,
      brand: null,
      features: [],
      description,
    }));
    expect((await post(report())).status).toBe(502);
    resetAiClient();
    setAiClient({ ...mockAiClient, embed: async () => [1, 2, 3] });
    expect((await post(report())).status).toBe(502);
    expect(await prisma.lostReport.count()).toBe(0);
  });
});

describe("기준 4. 후보 범위: 분실 이후, 등록됨·열람됨, 보관 기한 안", () => {
  it("상태·시각·기한이 안 맞는 습득물은 빠진다", async () => {
    const ok1 = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const ok2 = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      foundAt: hoursAgo(1),
      status: "REVEALED",
    });
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(5) }); // 분실 전 등록
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1), status: "REVIEW" });
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1), status: "CLAIMED" });
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1), status: "EXPIRED" });
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1), expiresAt: hoursAgo(0.5) });
    const ids = (await post(report())).body.candidates.map((c: { foundItemId: string }) => c.foundItemId).sort();
    expect(ids).toEqual([ok1.id, ok2.id].sort());
  });
});

describe("기준 5. 종류: 같은 종류, 2순위 종류, 연관 묶음, 기타", () => {
  // 같은 종류는 기준 4·6에서 본다. 후보가 최대 3개라 여기서는 나머지 셋만 넣는다
  it("관련 없는 종류만 빠진다", async () => {
    const alt = await createFoundItem({
      buildingId: A,
      category: "STATIONERY",
      categoryAlt: "EARPHONE",
      foundAt: hoursAgo(1),
    });
    const related = await createFoundItem({ buildingId: A, category: "CHARGER", foundAt: hoursAgo(1) });
    const etc = await createFoundItem({ buildingId: A, category: "ETC", foundAt: hoursAgo(1) });
    await createFoundItem({ buildingId: A, category: "UMBRELLA", foundAt: hoursAgo(1) });
    const ids = (await post(report())).body.candidates.map((c: { foundItemId: string }) => c.foundItemId).sort();
    expect(ids).toEqual([alt.id, related.id, etc.id].sort());
  });
});

describe("기준 6. 점수로 최대 3개를 고른다", () => {
  it("정확한 종류·같은 건물·가까운 시간·비슷한 설명이 우선, 같은 건물이 다른 건물의 정확한 종류보다 앞선다", async () => {
    const t = (h: number) => hoursAgo(h);
    const best = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      color: "흰색",
      description: DESC,
      foundAt: t(1.5),
    });
    const sameBldg = await createFoundItem({ buildingId: A, category: "EARPHONE", color: "검정", foundAt: t(1.4) });
    const otherBldg = await createFoundItem({ buildingId: B, category: "EARPHONE", foundAt: t(1.3) });
    const alt = await createFoundItem({
      buildingId: A,
      category: "STATIONERY",
      categoryAlt: "EARPHONE",
      foundAt: t(1.2),
    });
    const related = await createFoundItem({ buildingId: A, category: "CHARGER", foundAt: t(1.1) });
    await createFoundItem({ buildingId: B, category: "ETC", foundAt: t(1.0) }); // 기타 + 다른 건물
    await createFoundItem({ buildingId: B, category: "CHARGER", foundAt: t(0.9) }); // 연관 + 다른 건물
    const res = await post(report());
    expect(res.body.candidates).toHaveLength(3);
    expect(res.body.candidates.map((c: { foundItemId: string }) => c.foundItemId).sort()).toEqual(
      [best.id, sameBldg.id, alt.id].sort(),
    );
    for (const out of [otherBldg, related])
      expect(res.body.candidates.map((c: { foundItemId: string }) => c.foundItemId)).not.toContain(out.id);
  });
});

describe("기준 7. 순서는 습득 시각 최신순, 응답에 비공개 정보·점수 없음", () => {
  it("점수가 가장 높은 물건이 맨 앞에 오지 않는다", async () => {
    const best = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      color: "WHITE",
      description: DESC,
      foundAt: hoursAgo(1.9),
    });
    const newer = await createFoundItem({ buildingId: B, category: "CHARGER", color: "BLACK", foundAt: hoursAgo(0.5) });
    const res = await post(report());
    expect(res.body.candidates.map((c: { foundItemId: string }) => c.foundItemId)).toEqual([newer.id, best.id]);
    const text = JSON.stringify(res.body);
    for (const secret of ["WHITE", "BLACK", "score", "color", "곰돌이", "description", "categoryAlt", "public.jpg"])
      expect(text).not.toContain(secret);
    expect(Object.keys(res.body.candidates[0]).sort()).toEqual([
      "attemptsLeft",
      "building",
      "category",
      "floor",
      "foundAt",
      "foundItemId",
      "inPersonOnly",
      "isSeed",
      "locked",
      "reasons",
      "thumbnailUrl",
    ]);
  });

  it("후보 사진은 강한 블러본의 서명 URL만 (공개본·원본 아님)", async () => {
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const res = await post(report());
    const url = res.body.candidates[0].thumbnailUrl as string;
    expect(url).toContain("/files/test/thumb.jpg");
    expect(url).toMatch(/[?&]sig=/);
    expect(url).toMatch(/[?&]exp=/);
  });

  it("근거는 공개 정보로만: 같은 종류·같은 건물·곧 습득, 2순위 종류로 걸린 물건엔 종류 근거 없음", async () => {
    // 5~6시간 전에 잃어버림
    const exact = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(4) }); // 1시간 뒤 습득
    const related = await createFoundItem({ buildingId: B, category: "CHARGER", foundAt: hoursAgo(1) }); // 4시간 뒤
    // 공개 종류는 우산이지만 2순위(비공개)가 이어폰이라 후보에 든다. 근거로 2순위를 드러내면 안 된다.
    const viaAlt = await createFoundItem({
      buildingId: B,
      category: "UMBRELLA",
      categoryAlt: "EARPHONE",
      foundAt: hoursAgo(1),
    });
    const res = await post(report({ lostFrom: hoursAgo(6).toISOString(), lostTo: hoursAgo(5).toISOString() }));
    const byId = new Map(
      res.body.candidates.map((c: { foundItemId: string; reasons: string[] }) => [c.foundItemId, c.reasons]),
    );
    expect(byId.get(exact.id)).toEqual(["SAME_CATEGORY", "SAME_BUILDING", "FOUND_SOON_AFTER"]);
    expect(byId.get(related.id)).toEqual(["RELATED_CATEGORY"]);
    expect(byId.get(viaAlt.id)).toEqual([]);
  });
});

describe("기준 8. 체험 계정은 시드만, 일반 계정은 시드 제외", () => {
  it("서로 다른 후보", async () => {
    const real = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const seed = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1), isSeed: true });
    const demo = await demoLogin(app);
    const forUser = (await post(report())).body.candidates;
    const forDemo = (await post(report(), demo.accessToken)).body.candidates;
    expect(forUser.map((c: { foundItemId: string }) => c.foundItemId)).toEqual([real.id]);
    expect(forDemo.map((c: { foundItemId: string }) => c.foundItemId)).toEqual([seed.id]);
    expect(forDemo[0].isSeed).toBe(true);
  });
});

describe("기준 9. 내 신고만 보이고, 남은 시도 횟수가 맞다", () => {
  it("남의 신고는 404, 목록은 내 것만", async () => {
    const mine = (await post(report())).body.id;
    const other = await signupUser(app, "other@skuniv.ac.kr");
    const theirs = (await post(report(), other.accessToken)).body.id;
    expect((await request(app).get(`/api/v1/lost-reports/${theirs}/candidates`).set(auth())).status).toBe(404);
    expect(
      (await request(app).patch(`/api/v1/lost-reports/${theirs}`).set(auth()).send({ status: "CLOSED" })).status,
    ).toBe(404);
    expect((await request(app).get("/api/v1/lost-reports/not-a-uuid/candidates").set(auth())).status).toBe(400);
    const list = await request(app).get("/api/v1/lost-reports").set(auth());
    expect(list.body.reports.map((r: { id: string }) => r.id)).toEqual([mine]);
  });

  it("목록의 후보 수, 실패 횟수만큼 줄어드는 attemptsLeft와 잠금", async () => {
    const item = await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const { body } = await post(report());
    const me = await prisma.user.findFirstOrThrow({ where: { email: "student@skuniv.ac.kr" } });
    const attempt = (data: object) =>
      prisma.matchAttempt.create({
        data: {
          userId: me.id,
          lostReportId: body.id,
          foundItemId: item.id,
          descriptionHash: "h",
          score: 0,
          scoreBreakdown: {},
          matchedFields: {},
          ...data,
        } as never,
      });
    await attempt({ result: "FAIL" });
    await attempt({ result: "BORDERLINE", answerCorrect: false });
    await attempt({ result: "BORDERLINE", answerCorrect: null }); // 아직 답 안 함: 실패 아님
    let c = (await request(app).get(`/api/v1/lost-reports/${body.id}/candidates`).set(auth())).body.candidates[0];
    expect(c).toMatchObject({ attemptsLeft: 1, locked: false });
    await attempt({ result: "FAIL" });
    c = (await request(app).get(`/api/v1/lost-reports/${body.id}/candidates`).set(auth())).body.candidates[0];
    expect(c).toMatchObject({ attemptsLeft: 0, locked: true });
    expect((await request(app).get("/api/v1/lost-reports").set(auth())).body.reports[0].candidateCount).toBe(1);
  });
});

describe("기준 10. 설명 고치기와 신고 닫기", () => {
  it("설명을 고치면 다시 분석·임베딩하고 해시가 바뀐다, 같은 설명이면 그대로", async () => {
    let calls = 0;
    useExtraction(async (description) => {
      calls++;
      return { category: "EARPHONE", color: null, brand: null, features: [], description };
    });
    const { body } = await post(report());
    const before = await prisma.lostReport.findUniqueOrThrow({ where: { id: body.id } });
    const patch = (description: string) =>
      request(app).patch(`/api/v1/lost-reports/${body.id}`).set(auth()).send({ description });

    await patch(`  ${DESC}  `).expect(200); // 공백만 다름 → 다시 분석 안 함
    expect(calls).toBe(1);
    const res = await patch("검정 에어팟, 토끼 스티커").expect(200);
    expect(calls).toBe(2);
    expect(res.body.status).toBe("OPEN");
    const after = await prisma.lostReport.findUniqueOrThrow({ where: { id: body.id } });
    expect(after.descriptionHash).not.toBe(before.descriptionHash);
    expect(after.description).toBe("검정 에어팟, 토끼 스티커");
  });

  it("닫으면 후보가 비고, 다시 고칠 수 없다", async () => {
    await createFoundItem({ buildingId: A, category: "EARPHONE", foundAt: hoursAgo(1) });
    const { body } = await post(report());
    const closed = await request(app).patch(`/api/v1/lost-reports/${body.id}`).set(auth()).send({ status: "CLOSED" });
    expect(closed.body).toMatchObject({ status: "CLOSED", candidates: [] });
    expect((await request(app).get(`/api/v1/lost-reports/${body.id}/candidates`).set(auth())).body.candidates).toEqual(
      [],
    );
    expect(
      (
        await request(app)
          .patch(`/api/v1/lost-reports/${body.id}`)
          .set(auth())
          .send({ description: "다시 고친 설명입니다" })
      ).status,
    ).toBe(400);
  });

  it("바꿀 내용이 없으면 400", async () => {
    const { body } = await post(report());
    expect((await request(app).patch(`/api/v1/lost-reports/${body.id}`).set(auth()).send({})).status).toBe(400);
  });
});
