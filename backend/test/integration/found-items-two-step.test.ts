// 두 단계 습득물 등록(analyze → confirm), 자세한 위치 설명, 맡긴 물건의 주운 건물 선택 사항 (프론트 연동 요청 ①②③)
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import { hmac } from "../../src/lib/hash";
import { findCandidates } from "../../src/matching/candidates";
import { PLACE_SCORE } from "../../src/matching/policy";
import { placeScore } from "../../src/matching/score";
import { expireUnclaimedItems } from "../../src/services/data-purge";
import { REVIEW_MESSAGE } from "../../src/services/found-items";
import { readLocalFile } from "../../src/storage/local";
import { createAdmin, finderConsentFields, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt } from "../helpers/fixtures";
import { noisyJpeg } from "../helpers/images";

let app: ReturnType<typeof createApp>;
let buildingId: number;
let placeId: number;

async function analyze(image?: Buffer, ua = "two-step-agent") {
  let req = request(app).post("/api/v1/found-items/analyze").set("User-Agent", ua);
  for (const [k, v] of Object.entries(finderConsentFields())) req = req.field(k, String(v));
  if (image) req = req.attach("image", image, "photo.jpg");
  return req;
}

const confirm = (id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/found-items/${id}/confirm`).send(body);

/** 가짜 AI는 늘 이어폰(귀중품)이라 확정은 보관처에 맡김으로 한다 (QA B11) */
const kept = () => ({ buildingId, storageType: "HANDED_OVER", storagePlaceId: placeId });

async function draft() {
  const res = await analyze(await noisyJpeg());
  expect(res.status).toBe(201);
  return res.body as { id: string; confirmToken: string };
}

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  buildingId = (await prisma.building.create({ data: { name: "혜인관", lat: 37.6, lng: 127 } })).id;
  placeId = (
    await prisma.storagePlace.create({
      data: { name: "혜인관 경비실", buildingId, guideText: "1층 정문 옆", org: "GUARD" },
    })
  ).id;
});

afterEach(() => resetAiClient());

describe("① analyze: 사진만 먼저 받아 종류를 알려 준다", () => {
  it("201로 종류·귀중품 여부·확정 토큰을 주고, 확정 전(ANALYZING)으로 저장한다", async () => {
    const before = Date.now();
    const res = await analyze(await noisyJpeg());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      confirmToken: expect.any(String),
      category: "EARPHONE",
      subCategory: "WIRELESS_EARBUDS",
      isValuable: true,
      message: null,
      confirmBy: expect.any(String),
    });
    const ttl = Date.parse(res.body.confirmBy) - before;
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThan(61 * 60_000);

    const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: res.body.id }, include: { detail: true } });
    expect(row).toMatchObject({ status: "ANALYZING", buildingId: null, storageType: null, category: "EARPHONE" });
    // 토큰 원문은 저장하지 않는다
    expect(row.confirmTokenHash).toBe(hmac(`found-confirm:${res.body.confirmToken}`));
    expect(JSON.stringify(row)).not.toContain(res.body.confirmToken);
    expect(await readLocalFile(row.detail?.imagePublicKey as string)).not.toBeNull();
  });

  it("사진이 없으면 400, 동의가 없으면 400", async () => {
    expect((await analyze()).status).toBe(400);
    const res = await request(app)
      .post("/api/v1/found-items/analyze")
      .attach("image", await noisyJpeg(), "photo.jpg");
    expect(res.status).toBe(400);
  });

  it("AI가 실패하면 종류 없이 안내 문구를 주고, 확정하면 검토 대기(REVIEW)", async () => {
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async () => {
        throw new Error("AI 장애");
      },
    });
    const res = await analyze(await noisyJpeg());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: null, isValuable: false, message: REVIEW_MESSAGE });

    const done = await confirm(res.body.id, {
      confirmToken: res.body.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ status: "REVIEW", category: null, message: REVIEW_MESSAGE });
  });

  it("확정 전에는 후보에 나오지 않고, 확정하면 나온다", async () => {
    const user = await signupUser(app);
    const report = {
      id: "00000000-0000-0000-0000-000000000000",
      userId: user.user.id,
      category: "EARPHONE" as const,
      lostFrom: new Date(Date.now() - 3600_000),
      lostTo: new Date(),
      buildingId,
      status: "OPEN",
      extractedAttributes: {},
    };
    const d = await draft();
    expect(await findCandidates(report, "USER")).toHaveLength(0);
    await confirm(d.id, { confirmToken: d.confirmToken, ...kept() }).expect(201);
    expect((await findCandidates(report, "USER")).map((c) => c.foundItemId)).toEqual([d.id]);
  });

  it("분석도 등록 횟수 제한에 들어간다 (같은 기기 10분에 5건)", async () => {
    const img = await noisyJpeg();
    for (let i = 0; i < 5; i++) expect((await analyze(img, "same-device")).status).toBe(201);
    const res = await analyze(img, "same-device");
    expect(res.status).toBe(429);
  });
});

describe("① confirm: 위치를 받아 등록을 끝낸다", () => {
  it("201로 한 번에 등록과 같은 응답을 주고, 습득 시각·보관 기한을 확정한 때부터 센다", async () => {
    const d = await draft();
    await prisma.foundItem.update({ where: { id: d.id }, data: { foundAt: new Date(Date.now() - 30 * 60_000) } });
    const before = Date.now();
    const res = await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), floor: 3 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: d.id,
      status: "REGISTERED",
      category: "EARPHONE",
      subCategory: "WIRELESS_EARBUDS",
      building: { id: buildingId, name: "혜인관" },
      floor: 3,
      storageType: "HANDED_OVER",
      storagePlace: { id: placeId, name: "혜인관 경비실", guideText: "1층 정문 옆" },
      message: null,
      handOverAdvice: null,
    });
    const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id } });
    expect(row).toMatchObject({ status: "REGISTERED", ...kept(), confirmTokenHash: null });
    expect(row.foundAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect((row.expiresAt as Date).getTime() - row.foundAt.getTime()).toBe(30 * 86_400_000);
  });

  it("토큰이 틀리면 404, 확정 시간이 지나면 404", async () => {
    const d = await draft();
    const wrong = await confirm(d.id, { confirmToken: "nope", ...kept() });
    expect(wrong.status).toBe(404);
    expect(wrong.body.error.code).toBe("NOT_FOUND");

    await prisma.foundItem.update({ where: { id: d.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await confirm(d.id, { confirmToken: d.confirmToken, ...kept() });
    expect(late.status).toBe(404);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("ANALYZING");
  });

  it("두 번 확정하면 409 ALREADY_CONFIRMED, 처음 값은 그대로", async () => {
    const d = await draft();
    await confirm(d.id, { confirmToken: d.confirmToken, ...kept() }).expect(201);
    const again = await confirm(d.id, {
      confirmToken: d.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CONFIRMED");
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id } })).storageType).toBe("HANDED_OVER");
  });

  it("동시에 두 번 눌러도 하나만 확정된다", async () => {
    const d = await draft();
    const body = { confirmToken: d.confirmToken, ...kept() };
    const results = await Promise.all([confirm(d.id, body), confirm(d.id, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.notification.count()).toBeLessThanOrEqual(1);
  });

  it("확정하지 않은 초안은 기한 뒤 정기 작업이 사진까지 지운다", async () => {
    const d = await draft();
    const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id }, include: { detail: true } });
    await expireUnclaimedItems(new Date(Date.now() + 61 * 60_000));
    const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id }, include: { detail: true } });
    expect(after.status).toBe("EXPIRED");
    expect(after.dataPurgedAt).not.toBeNull();
    expect(after.detail?.imagePublicKey).toBeNull();
    expect(await readLocalFile(row.detail?.imageOriginalKey as string)).toBeNull();
  });
});

describe("② 자세한 위치 설명 (locationDetail)", () => {
  it("저장하고, 판정을 통과한 계정의 상세에서만 층과 같이 보인다", async () => {
    const d = await draft();
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      ...kept(),
      floor: 3,
      locationDetail: "  3층 엘리베이터 앞 벤치 위  ",
    });
    expect(res.status).toBe(201);
    // 등록 응답(공개 정보)에는 넣지 않는다
    expect(JSON.stringify(res.body)).not.toContain("엘리베이터");

    const user = await signupUser(app);
    const detail = () =>
      request(app).get(`/api/v1/found-items/${d.id}/detail`).set("Authorization", `Bearer ${user.accessToken}`);
    expect((await detail()).status).toBe(403);
    await createAttempt(user.user.id, d.id, { result: "PASS" });
    const shown = await detail();
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({ floor: 3, locationDetail: "3층 엘리베이터 앞 벤치 위" });
  });

  it("200자를 넘으면 400, 빈 칸은 없는 것으로 본다", async () => {
    const d = await draft();
    const long = await confirm(d.id, {
      confirmToken: d.confirmToken,
      ...kept(),
      locationDetail: "가".repeat(201),
    });
    expect(long.status).toBe(400);
    await confirm(d.id, {
      confirmToken: d.confirmToken,
      ...kept(),
      locationDetail: "   ",
    }).expect(201);
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    expect(row.locationDetail).toBeNull();
  });

  it("한 번에 등록(POST /found-items)에서도 받는다", async () => {
    let req = request(app).post("/api/v1/found-items");
    const fields = {
      ...finderConsentFields(),
      buildingId,
      storageType: "HANDED_OVER",
      storagePlaceId: placeId,
      locationDetail: "204호 뒤쪽 책상",
    };
    for (const [k, v] of Object.entries(fields)) req = req.field(k, String(v));
    const res = await req.attach("image", await noisyJpeg(), "photo.jpg");
    expect(res.status).toBe(201);
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: res.body.id } });
    expect(row.locationDetail).toBe("204호 뒤쪽 책상");
  });

  it("수령·만료로 비공개 정보를 지울 때 같이 지운다", async () => {
    const d = await draft();
    await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), locationDetail: "벤치" });
    await prisma.foundItem.update({ where: { id: d.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expireUnclaimedItems();
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    expect(row.locationDetail).toBeNull();
  });
});

describe("③ 보관처에 맡기면 주운 건물은 선택 사항", () => {
  it("건물 없이 맡기면 201, 건물은 null (보관처 건물로 채우지 않는다)", async () => {
    const d = await draft();
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      storageType: "HANDED_OVER",
      storagePlaceId: placeId,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REGISTERED", building: null, storagePlace: { id: placeId } });
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id } })).buildingId).toBeNull();
  });

  it("그 자리에 두면 건물이 필수 (400)", async () => {
    const d = await draft();
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: "buildingId" })]);
  });

  it("그 자리에 두면 자세한 위치가 필수: 비었거나 4자 미만이면 400, 적으면 201 (QA 10/31)", async () => {
    for (const locationDetail of [undefined, "", "   ", "책상"]) {
      const d = await draft();
      const res = await confirm(d.id, {
        confirmToken: d.confirmToken,
        buildingId,
        storageType: "IN_PLACE",
        ...(locationDetail === undefined ? {} : { locationDetail }),
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details).toEqual([expect.objectContaining({ path: "locationDetail" })]);
    }
    const d = await draft();
    const ok = await confirm(d.id, {
      confirmToken: d.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "3층 302호 뒤쪽 창가 책상 위",
    });
    expect(ok.status).toBe(201);
  });

  it("보관처에 맡기면 자세한 위치는 선택", async () => {
    const d = await draft();
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      storageType: "HANDED_OVER",
      storagePlaceId: placeId,
    });
    expect(res.status).toBe(201);
  });

  it("DB도 그 자리에 둔 물건의 건물 없음을 막는다", async () => {
    const d = await draft();
    await expect(
      prisma.foundItem.update({ where: { id: d.id }, data: { status: "REGISTERED", storageType: "IN_PLACE" } }),
    ).rejects.toThrow();
  });

  it("주운 건물을 모르면 매칭 위치 점수는 '모름'", () => {
    expect(placeScore(buildingId, null)).toBe(PLACE_SCORE.unknown);
    expect(placeScore(null, buildingId)).toBe(PLACE_SCORE.unknown);
    expect(placeScore(buildingId, buildingId)).toBe(PLACE_SCORE.same);
  });

  it("건물 없이 맡긴 물건도 후보에 나오고, '같은 건물' 근거는 붙지 않는다", async () => {
    const user = await signupUser(app);
    const d = await draft();
    await confirm(d.id, { confirmToken: d.confirmToken, storageType: "HANDED_OVER", storagePlaceId: placeId }).expect(
      201,
    );
    const list = await findCandidates(
      {
        id: "00000000-0000-0000-0000-000000000000",
        userId: user.user.id,
        category: "EARPHONE",
        lostFrom: new Date(Date.now() - 3600_000),
        lostTo: new Date(),
        buildingId,
        status: "OPEN",
        extractedAttributes: {},
      },
      "USER",
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.building).toBeNull();
    expect(list[0]?.reasons).not.toContain("SAME_BUILDING");
  });
});

describe("④ 귀중품도 그 자리에 둘 수 있다. 화면이 보관처를 추천하고, 교무처에 알린다 (10/30 정책 변경, QA B11)", () => {
  /** 그 자리에 둔 물건은 보관처가 없어 교무처(CENTER) 관리자가 맡는다 (open-issues #18) */
  async function centerAdmin() {
    const center = await prisma.storagePlace.create({
      data: { name: "교무처", buildingId, guideText: "혜인관 1층 교무처 · 평일 9~18시", org: "CENTER" },
    });
    return createAdmin("center@skuniv.ac.kr", "password123", center.id);
  }

  function extractAs(category: "UMBRELLA" | "WALLET") {
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async (...args) => ({
        ...(await mockAiClient.extractFoundItem(...args)),
        category,
        categoryAlt: null,
        subCategory: null,
      }),
    });
  }

  it("귀중품을 그 자리에 두면 201, 담당 관리자에게 '그 자리에 둔 귀중품' 알림을 한 번 보낸다", async () => {
    const admin = await centerAdmin();
    const d = await draft(); // 가짜 AI: 이어폰 (isValuable: true)
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REGISTERED", storageType: "IN_PLACE", storagePlace: null });
    const alerts = await prisma.notification.findMany({ where: { userId: admin.id, type: "VALUABLE_IN_PLACE" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.foundItemId).toBe(d.id);
    expect(alerts[0]?.message).toContain("그 자리에 등록됐어요");
    // 맡긴 물건 알림(ITEM_INCOMING)은 가지 않는다
    expect(await prisma.notification.count({ where: { type: "ITEM_INCOMING" } })).toBe(0);
  });

  it("지갑을 그 자리에 둬도 201, 귀중품이 아니면(우산) 알림 없이 그 자리에 둔다", async () => {
    const admin = await centerAdmin();
    extractAs("WALLET");
    const wallet = await draft();
    const walletRes = await confirm(wallet.id, {
      confirmToken: wallet.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(walletRes.status).toBe(201);

    extractAs("UMBRELLA");
    const res = await analyze(await noisyJpeg(), "umbrella-agent");
    expect(res.body).toMatchObject({ category: "UMBRELLA", isValuable: false });
    const done = await confirm(res.body.id, {
      confirmToken: res.body.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ status: "REGISTERED", storageType: "IN_PLACE", storagePlace: null });
    const alerts = await prisma.notification.findMany({ where: { userId: admin.id, type: "VALUABLE_IN_PLACE" } });
    expect(alerts.map((a) => a.foundItemId)).toEqual([wallet.id]);
  });

  it("AI가 실패해 종류를 모르면(REVIEW) 그 자리에 둠도 받는다", async () => {
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async () => {
        throw new Error("AI 장애");
      },
    });
    const d = await draft();
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REVIEW", storageType: "IN_PLACE" });
  });
});

describe("⑤ 습득자가 종류를 고친다 (AI 오인, 10/29 안경 → 학생증)", () => {
  it("고친 종류·세부 종류로 등록하고, AI가 본 종류는 다른 후보로 남긴다", async () => {
    const d = await draft(); // 가짜 AI: 무선 이어폰 (귀중품)
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
      category: "GLASSES",
      subCategory: null,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REGISTERED", category: "GLASSES", subCategory: null });
    const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id }, include: { detail: true } });
    expect(row).toMatchObject({ category: "GLASSES", subCategory: null, categoryAlt: "EARPHONE" });
    expect(row.detail).toMatchObject({ title: "안경·선글라스", description: "안경·선글라스" });
  });

  it("고친 종류가 귀중품이어도 그 자리에 둘 수 있고, 다른 종류의 세부 종류는 버린다", async () => {
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async (...args) => ({
        ...(await mockAiClient.extractFoundItem(...args)),
        category: "UMBRELLA",
        categoryAlt: null,
        subCategory: null,
      }),
    });
    const d = await draft();
    const wallet = await confirm(d.id, {
      confirmToken: d.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
      category: "WALLET",
    });
    expect(wallet.status).toBe(201);
    expect(wallet.body).toMatchObject({ category: "WALLET", storageType: "IN_PLACE" });

    const other = await draft();
    const ok = await confirm(other.id, {
      confirmToken: other.confirmToken,
      ...kept(),
      category: "BAG",
      subCategory: "MOUSE",
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ category: "BAG", subCategory: null });
  });

  it("같은 종류를 보내면 그대로 두고, 분석 실패 초안은 고쳐도 검토 대기(REVIEW)", async () => {
    const same = await draft();
    await confirm(same.id, { confirmToken: same.confirmToken, ...kept(), category: "EARPHONE" });
    const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: same.id } });
    expect(row).toMatchObject({ category: "EARPHONE", subCategory: "WIRELESS_EARBUDS", categoryAlt: "CHARGER" });

    setAiClient({
      ...mockAiClient,
      extractFoundItem: async () => {
        throw new Error("AI 장애");
      },
    });
    const failed = await analyze(await noisyJpeg(), "failed-agent");
    const res = await confirm(failed.body.id, {
      confirmToken: failed.body.confirmToken,
      buildingId,
      storageType: "IN_PLACE",
      locationDetail: "강의실 뒤 책상 위",
      category: "GLASSES",
    });
    expect(res.body).toMatchObject({ status: "REVIEW", category: null });
  });
});
