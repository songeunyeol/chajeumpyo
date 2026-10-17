// F-15 분실 다발 카드: 이슈의 완료 기준 10개
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { hotspots } from "../../src/services/hotspots";
import { createAdmin, signupUser } from "../helpers/auth";
import { resetDb } from "../helpers/db";
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
    expect((await get(range)).body.topInsight).toBe(
      "학술정보관에서 오후 1시~3시에 충전기·기타 전자기기 분실이 가장 많아요.",
    );
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
