// 물건 종류 24개 (#27): 이슈의 완료 기준 7(고가품 보관), 9(API가 새 값만 받는다)
import type { FoundItemExtraction } from "@chajeumpyo/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import { createAdmin, finderConsentFields, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";
import { noisyJpeg } from "../helpers/images";

let app: ReturnType<typeof createApp>;
let A: number;
let place: number;

function extractAs(category: FoundItemExtraction["category"]) {
  setAiClient({
    ...mockAiClient,
    extractFoundItem: async (...args) => ({ ...(await mockAiClient.extractFoundItem(...args)), category }),
  });
}

async function register() {
  let req = request(app).post("/api/v1/found-items").set("User-Agent", `ua-${Math.random()}`);
  for (const [k, v] of Object.entries({ ...finderConsentFields(), buildingId: A, storageType: "IN_PLACE" }))
    req = req.field(k, String(v));
  return req.attach("image", await noisyJpeg(), "p.jpg");
}

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
  A = (await createBuilding("혜인관")).id;
  place = (await createStoragePlace("혜인관 경비실", A)).id;
});

afterEach(() => resetAiClient());

describe("기준 7. 고가품 종류도 그 자리에 둘 수 있다 (10/30 정책 변경, QA B11)", () => {
  it("휴대폰·현금·스마트워치·열쇠·텀블러 모두 201", async () => {
    for (const category of ["PHONE", "CASH", "SMARTWATCH", "KEY", "TUMBLER"] as const) {
      extractAs(category);
      const res = await register();
      expect(res.status, category).toBe(201);
      expect(res.body.handOverAdvice, category).toBeNull();
    }
  });
});

describe("기준 9. 등록·신고·관리자 수정은 새 값만 받는다", () => {
  it("AI가 고른 새 종류를 그대로 저장", async () => {
    extractAs("GLASSES");
    const res = await register();
    expect(res.status).toBe(201);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: res.body.id } })).category).toBe("GLASSES");
  });

  it("분실 신고: KEY는 201, 옛 값 CARD·LAPTOP_TABLET은 400", async () => {
    const { accessToken } = await signupUser(app);
    const post = (category: string) =>
      request(app)
        .post("/api/v1/lost-reports")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          category,
          lostFrom: hoursAgo(3).toISOString(),
          lostTo: hoursAgo(2).toISOString(),
          buildingId: A,
          description: "집 열쇠 꾸러미",
        });
    expect((await post("KEY")).status).toBe(201);
    for (const old of ["CARD", "LAPTOP_TABLET", "PENCIL_CASE", "CLOTHING_BAG"]) {
      const res = await post(old);
      expect(res.status, old).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.lostReport.count()).toBe(1);
  });

  it("관리자 수정: SMARTWATCH는 반영, 옛 값은 400", async () => {
    await createAdmin("guard@skuniv.ac.kr", "adminpass1", place);
    const token = (
      await request(app).post("/api/v1/admin/auth/login").send({ email: "guard@skuniv.ac.kr", password: "adminpass1" })
    ).body.accessToken as string;
    const item = await createFoundItem({
      buildingId: A,
      category: "EARPHONE",
      foundAt: hoursAgo(1),
      storageType: "HANDED_OVER",
      storagePlaceId: place,
    });
    const patch = (body: object) =>
      request(app).patch(`/api/v1/admin/found-items/${item.id}`).set("Authorization", `Bearer ${token}`).send(body);
    expect((await patch({ category: "CARD" })).status).toBe(400);
    expect((await patch({ categoryAlt: "LAPTOP_TABLET" })).status).toBe(400);
    const ok = await patch({ category: "SMARTWATCH", categoryAlt: "ACCESSORY" });
    expect(ok.status).toBe(200);
    expect(await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      category: "SMARTWATCH",
      categoryAlt: "ACCESSORY",
    });
  });
});
