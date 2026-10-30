// 습득자 물건 설명(선택): 비공개 저장, 개인정보 숫자 제거, 사진 특징 보강, 사진 분석 실패 시 텍스트 분류 (10/30 팀 요청)
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAiClient, setAiClient } from "../../src/ai";
import { mockAiClient } from "../../src/ai/mock";
import { createApp } from "../../src/app";
import { resetPremasker, setPremasker } from "../../src/privacy/premask";
import { expireUnclaimedItems } from "../../src/services/data-purge";
import { scrubFinderNote } from "../../src/services/found-items";
import { finderConsentFields } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { noisyJpeg } from "../helpers/images";

let app: ReturnType<typeof createApp>;
let buildingId: number;
let placeId: number;

async function analyze(ua = "note-agent") {
  let req = request(app).post("/api/v1/found-items/analyze").set("User-Agent", ua);
  for (const [k, v] of Object.entries(finderConsentFields())) req = req.field(k, String(v));
  return req.attach("image", await noisyJpeg(), "photo.jpg");
}
const confirm = (id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/found-items/${id}/confirm`).send(body);
const kept = () => ({ buildingId, storageType: "HANDED_OVER", storagePlaceId: placeId });

const failPhoto = () =>
  setAiClient({
    ...mockAiClient,
    extractFoundItem: async () => {
      throw new Error("AI 장애");
    },
  });

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  resetPremasker();
  app = createApp();
  buildingId = (await prisma.building.create({ data: { name: "혜인관", lat: 37.6, lng: 127 } })).id;
  placeId = (await prisma.storagePlace.create({ data: { name: "교무처", buildingId, guideText: "1층", org: "GUARD" } }))
    .id;
});
afterEach(() => {
  resetAiClient();
  resetPremasker();
});

describe("scrubFinderNote: 개인정보 숫자를 지운다", () => {
  it("전화번호·메일·학번 같은 긴 숫자를 지우고, 남는 글이 없으면 null", () => {
    expect(scrubFinderNote("남색 카드지갑 010-1234-5678 연락")).toBe("남색 카드지갑 연락");
    expect(scrubFinderNote("학번 2023216097 학생증")).toBe("학번 학생증");
    expect(scrubFinderNote("hong@skuniv.ac.kr 지갑")).toBe("지갑");
    expect(scrubFinderNote("카드 2장, 3층")).toBe("카드 2장, 3층");
    expect(scrubFinderNote("01012345678")).toBeNull();
    expect(scrubFinderNote(undefined)).toBeNull();
  });
});

describe("물건 설명 저장과 공개 범위", () => {
  it("비공개 상세(finderNote)에만 저장하고, 등록 응답·후보에는 나오지 않는다", async () => {
    const d = (await analyze()).body;
    const res = await confirm(d.id, {
      confirmToken: d.confirmToken,
      ...kept(),
      note: "케이스에 토끼 스티커, 010-9999-8888",
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain("토끼");
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    expect(row.finderNote).toBe("케이스에 토끼 스티커,");
    expect(row.finderNote).not.toContain("9999");
  });

  it("사진 분석에 성공했으면 설명 특징을 출처(finder)와 함께 비공개 특징에 덧붙인다", async () => {
    const d = (await analyze()).body;
    const before = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    const n = (before.features as unknown[]).length;
    await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "케이스에 토끼 스티커" }).expect(201);
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    const features = row.features as { value: string; source?: string }[];
    expect(features.length).toBeGreaterThan(n);
    expect(features.filter((f) => f.source === "finder").length).toBeGreaterThan(0);
  });

  it("200자를 넘으면 400", async () => {
    const d = (await analyze()).body;
    const res = await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "가".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("수령·만료로 비공개 정보를 지울 때 같이 지운다", async () => {
    const d = (await analyze()).body;
    await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "토끼 스티커" }).expect(201);
    await prisma.foundItem.update({ where: { id: d.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expireUnclaimedItems();
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    expect(row.finderNote).toBeNull();
  });
});

describe("사진 분석이 실패하면 설명으로 종류를 정한다 (텍스트 분류)", () => {
  it("가리기에 성공했고 설명으로 종류를 알면 REGISTERED, 후보 검색용 임베딩도 만든다", async () => {
    failPhoto();
    const d = (await analyze()).body;
    expect(d.category).toBeNull();
    const res = await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "검정 반지갑, 안쪽에 영수증" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "REGISTERED", category: "WALLET", message: null });
    const row = await prisma.foundItem.findUniqueOrThrow({ where: { id: d.id }, include: { detail: true } });
    expect(row.detail?.color).toBe("BLACK");
    // 공개 사진은 민감 여부를 몰라 흐린 상태 그대로다
    expect(row.detail?.isSensitive).toBe(true);
    // 후보 검색에 쓰는 임베딩을 설명으로 만들었다
    const emb = await prisma.$queryRaw<
      { has: boolean }[]
    >`SELECT embedding IS NOT NULL AS has FROM found_item_detail WHERE found_item_id = ${d.id}::uuid`;
    expect(emb[0]?.has).toBe(true);
  });

  it("설명으로도 종류를 모르면(기타·특징 없음) 지금처럼 검토 대기", async () => {
    failPhoto();
    const d = (await analyze()).body;
    const res = await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "뭔지 모르겠어요" });
    expect(res.body).toMatchObject({ status: "REVIEW", category: null });
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    expect(row.finderNote).toBe("뭔지 모르겠어요");
  });

  it("서버 안 가리기에 실패한 사진은 설명이 있어도 자동 등록하지 않는다", async () => {
    setPremasker(async () => {
      throw new Error("가리기 실패");
    });
    const d = (await analyze()).body;
    const res = await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "검정 지갑" });
    expect(res.body).toMatchObject({ status: "REVIEW", category: null });
  });

  it("설명 분석도 실패하면 검토 대기, 설명 글은 남긴다", async () => {
    setAiClient({
      ...mockAiClient,
      extractFoundItem: async () => {
        throw new Error("AI 장애");
      },
      extractLostReport: async () => {
        throw new Error("AI 장애");
      },
    });
    const d = (await analyze()).body;
    const res = await confirm(d.id, { confirmToken: d.confirmToken, ...kept(), note: "검정 지갑" });
    expect(res.body).toMatchObject({ status: "REVIEW" });
    const row = await prisma.foundItemDetail.findUniqueOrThrow({ where: { foundItemId: d.id } });
    expect(row.finderNote).toBe("검정 지갑");
  });
});
