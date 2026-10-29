// F-15 분실 다발 카드: 이슈의 완료 기준 10개
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { hotspots } from "../../src/services/hotspots";
import { createAdmin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createBuilding, createFoundItem } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let admin: string;
let LIB: number;
let HYE: number;

/** 한국 시간으로 "2026-10-05 13:30" 같은 시각 */
const kst = (day: string, hh: number, mm = 0) =>
  new Date(Date.parse(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`));

const get = (q = "", t = admin) =>
  request(app).get(`/api/v1/admin/stats/hotspots${q}`).set("Authorization", `Bearer ${t}`);
const add = (
  buildingId: number,
  category: Parameters<typeof createFoundItem>[0]["category"],
  foundAt: Date,
  isSeed = false,
) => createFoundItem({ buildingId, category, foundAt, isSeed, status: category ? "REGISTERED" : "REVIEW" });

beforeEach(async () => {
  await resetDb();
  app = createApp();
  LIB = (await createBuilding("학술정보관")).id;
  HYE = (await createBuilding("혜인관")).id;
  await createAdmin("admin@skuniv.ac.kr", "adminpass1");
  admin = (
    await request(app).post("/api/v1/admin/auth/login").send({ email: "admin@skuniv.ac.kr", password: "adminpass1" })
  ).body.accessToken;
});

const range = "?from=2026-10-01&to=2026-10-10";

describe("기준 1. 건물별 건수, 많은 순", () => {
  it("학술정보관 3, 혜인관 1", async () => {
    for (let i = 0; i < 3; i++) await add(LIB, "CHARGER", kst("2026-10-05", 13, i));
    await add(HYE, "UMBRELLA", kst("2026-10-05", 9));
    expect((await get(range)).body.byBuilding).toEqual([
      { building: "학술정보관", count: 3 },
      { building: "혜인관", count: 1 },
    ]);
  });
});

describe("기준 2. 시간대는 한국 시간 기준", () => {
  it("한국 밤 12시 30분(UTC 15:30)은 0시, 오후 11시 59분은 23시", async () => {
    await add(LIB, "ETC", kst("2026-10-05", 0, 30));
    await add(LIB, "ETC", kst("2026-10-05", 23, 59));
    await add(LIB, "ETC", kst("2026-10-05", 23, 1));
    expect((await get(range)).body.byHour).toEqual([
      { hour: 23, count: 2 },
      { hour: 0, count: 1 },
    ]);
  });
});

describe("기준 3. 종류별 건수, 종류 없는 검토 대기는 종류 집계에서만 빠진다", () => {
  it("검토 대기도 건물·전체 수에는 들어간다", async () => {
    await add(LIB, "CHARGER", kst("2026-10-05", 13));
    await add(LIB, "CHARGER", kst("2026-10-05", 14));
    await add(LIB, null, kst("2026-10-05", 15));
    const body = (await get(range)).body;
    expect(body.total).toBe(3);
    expect(body.byCategory).toEqual([{ category: "CHARGER", count: 2 }]);
    expect(body.byBuilding).toEqual([{ building: "학술정보관", count: 3 }]);
  });
});

describe("기준 4. 기간은 한국 날짜 기준 양 끝 포함, 기본 최근 30일", () => {
  it("10/1 0시~10/10 23시 59분은 포함, 그 밖은 제외", async () => {
    await add(LIB, "ETC", kst("2026-10-01", 0, 0));
    await add(LIB, "ETC", kst("2026-10-10", 23, 59));
    await add(LIB, "ETC", kst("2026-09-30", 23, 59));
    await add(LIB, "ETC", kst("2026-10-11", 0, 0));
    const body = (await get(range)).body;
    expect(body.total).toBe(2);
    expect(body).toMatchObject({ from: "2026-10-01", to: "2026-10-10" });
  });

  it("기간을 생략하면 오늘(한국 날짜)까지 30일", async () => {
    await add(LIB, "ETC", kst("2026-10-11", 10));
    await add(LIB, "ETC", kst("2026-09-12", 10)); // 30일 전 날짜 = 포함
    await add(LIB, "ETC", kst("2026-09-11", 10)); // 31일 전 = 제외
    const body = await hotspots({}, kst("2026-10-11", 12));
    expect(body).toMatchObject({ from: "2026-09-12", to: "2026-10-11", total: 2 });
  });
});

describe("기준 5. 실제 데이터만 집계, 없으면 시드로 집계하고 표시", () => {
  it("실제가 있으면 시드는 섞지 않는다", async () => {
    await add(LIB, "CHARGER", kst("2026-10-05", 13));
    await add(HYE, "UMBRELLA", kst("2026-10-05", 13), true);
    const body = (await get(range)).body;
    expect(body).toMatchObject({ isSeedData: false, total: 1 });
  });

  it("실제가 없으면 시드로 집계하고 isSeedData", async () => {
    await add(HYE, "UMBRELLA", kst("2026-10-05", 13), true);
    expect((await get(range)).body).toMatchObject({ isSeedData: true, total: 1 });
  });
});

describe("기준 6. 가장 몰리는 건물·시간대·종류를 한 문장으로", () => {
  it("학술정보관 오후 1~3시 충전기", async () => {
    await add(LIB, "CHARGER", kst("2026-10-05", 13, 10));
    await add(LIB, "CHARGER", kst("2026-10-06", 14, 50));
    await add(LIB, "CHARGER", kst("2026-10-07", 13, 30));
    await add(HYE, "UMBRELLA", kst("2026-10-05", 9));
    await add(HYE, "UMBRELLA", kst("2026-10-05", 18));
    expect((await get(range)).body.topInsight).toBe("학술정보관에서 오후 1시~3시에 기타 전자기기 분실이 가장 많아요.");
  });

  it("가장 많은 구간이 1건뿐이면 데이터가 적다고 안내", async () => {
    await add(LIB, "CHARGER", kst("2026-10-05", 13));
    await add(HYE, "UMBRELLA", kst("2026-10-05", 9));
    expect((await get(range)).body.topInsight).toContain("데이터가 적어서");
  });
});

describe("기준 7. 입력 검증", () => {
  it("거꾸로 된 기간, 날짜 형식 오류, 1년 넘는 기간은 400", async () => {
    expect((await get("?from=2026-10-10&to=2026-10-01")).status).toBe(400);
    expect((await get("?from=2026/10/01")).status).toBe(400);
    expect((await get("?from=2025-01-01&to=2026-10-01")).status).toBe(400);
  });
});

describe("기준 8. 관리자만, 개인정보 없음", () => {
  it("회원 403, 비로그인 401, 응답에 id·이메일 없음", async () => {
    const user = await signupUser(app);
    expect((await get(range, user.accessToken)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/stats/hotspots")).status).toBe(401);
    await add(LIB, "CHARGER", kst("2026-10-05", 13));
    const text = JSON.stringify((await get(range)).body);
    expect(text).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe("기준 9. 동점이면 이름순, 같은 입력엔 같은 결과", () => {
  it("건물 동점은 가나다순", async () => {
    await add(HYE, "ETC", kst("2026-10-05", 10));
    await add(LIB, "ETC", kst("2026-10-05", 11));
    const a = (await get(range)).body;
    const b = (await get(range)).body;
    expect(a.byBuilding.map((x: { building: string }) => x.building)).toEqual(["학술정보관", "혜인관"]);
    expect(a).toEqual(b);
  });
});

describe("기준 10. 데이터가 없으면 빈 집계와 안내", () => {
  it("200, 빈 배열", async () => {
    const res = await get(range);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, isSeedData: false, byBuilding: [], byHour: [], byCategory: [] });
    expect(res.body.topInsight).toContain("데이터가 적어서");
  });
});

describe("기준 11. 먼저 손볼 구간: 반복 탐지·우선순위·예방 조치 (10/29)", () => {
  it("2건 이상 반복된 구간만, 겹치는 창은 하나로, 우선순위·추세·보관 중 수·조치", async () => {
    // 학술정보관 오후 1~3시 충전기 4건 (뒤쪽 절반에 3건), 1건은 수령됨
    await add(LIB, "CHARGER", kst("2026-10-02", 13));
    await add(LIB, "CHARGER", kst("2026-10-07", 13, 30));
    await add(LIB, "CHARGER", kst("2026-10-08", 14));
    const claimed = await add(LIB, "CHARGER", kst("2026-10-09", 14, 10));
    await prisma.foundItem.update({ where: { id: claimed.id }, data: { status: "CLAIMED" } });
    // 혜인관 오전 10시 우산 2건 (앞쪽 절반)
    await add(HYE, "UMBRELLA", kst("2026-10-02", 10));
    await add(HYE, "UMBRELLA", kst("2026-10-03", 10, 20));
    // 반복 아님
    await add(HYE, "WALLET", kst("2026-10-05", 18));

    const { priorities } = (await get(range)).body;
    expect(priorities).toHaveLength(2);
    const [first, second] = priorities;
    expect(first).toMatchObject({
      building: "학술정보관",
      startHour: 13,
      category: "CHARGER",
      count: 4,
      recent: 3,
      earlier: 1,
      trend: "UP",
      unclaimed: 3,
      level: "HIGH",
    });
    expect(first.summary).toBe("학술정보관 오후 1시~3시 기타 전자기기 분실 4건 (최근 늘고 있어요, 보관 중 3건)");
    expect(first.action).toContain("콘센트");
    expect(second).toMatchObject({
      building: "혜인관",
      category: "UMBRELLA",
      count: 2,
      trend: "DOWN",
      level: "MEDIUM",
    });
    expect(second.action).toContain("우산꽂이");
  });

  it("반복이 없으면 빈 배열, 시드만 있으면 시드로 계산하고 시드 표시", async () => {
    await add(LIB, "CHARGER", kst("2026-10-05", 13));
    expect((await get(range)).body.priorities).toEqual([]);
    // 실제 데이터가 없는 9월에 시드 2건
    await add(LIB, "BOOK", kst("2026-09-05", 9), true);
    await add(LIB, "BOOK", kst("2026-09-06", 9), true);
    const body = (await get("?from=2026-09-01&to=2026-09-10")).body;
    expect(body.isSeedData).toBe(true);
    expect(body.priorities[0]).toMatchObject({ building: "학술정보관", category: "BOOK", count: 2 });
  });
});

describe("기준 12. 분실 신고가 반복되는 곳 (10/29)", () => {
  const report = async (
    userId: string,
    buildingId: number | null,
    category: "EARPHONE" | "UMBRELLA",
    at: Date,
    status: "OPEN" | "RESOLVED" = "OPEN",
  ) =>
    prisma.lostReport.create({
      data: {
        userId,
        buildingId,
        category,
        lostFrom: at,
        lostTo: at,
        description: "신고",
        descriptionHash: "h",
        status,
        createdAt: at,
      },
    });

  it("건물 × 종류로 2건 이상, 못 찾은 수·같은 곳 습득 수·조치, 체험 계정 신고는 뺀다", async () => {
    const u = await prisma.user.create({ data: { email: "a@skuniv.ac.kr", passwordHash: "x" } });
    const demo = await prisma.user.create({ data: { email: "demo@skuniv.ac.kr", passwordHash: "x", role: "DEMO" } });
    await report(u.id, HYE, "EARPHONE", kst("2026-10-02", 10));
    await report(u.id, HYE, "EARPHONE", kst("2026-10-04", 11), "RESOLVED");
    await report(u.id, HYE, "EARPHONE", kst("2026-10-06", 12));
    await add(HYE, "EARPHONE", kst("2026-10-05", 12));
    await report(u.id, null, "UMBRELLA", kst("2026-10-03", 9));
    await report(demo.id, null, "UMBRELLA", kst("2026-10-03", 9));
    await report(u.id, LIB, "UMBRELLA", kst("2026-10-03", 9));

    const { reportHotspots } = (await get(range)).body;
    expect(reportHotspots).toHaveLength(1);
    expect(reportHotspots[0]).toMatchObject({
      building: "혜인관",
      category: "EARPHONE",
      reports: 3,
      open: 2,
      found: 1,
    });
    expect(reportHotspots[0].summary).toBe("혜인관 무선 이어폰 분실 신고 3건 (못 찾음 2건, 같은 곳 습득 등록 1건)");
    expect(reportHotspots[0].action).toContain("QR");
  });
});
