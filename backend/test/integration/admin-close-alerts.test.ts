// QA 10/30 3차: 관리자 보관 종료(지우는 기능), 맡긴 물건·수령 예정 알림
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { findCandidates } from "../../src/matching/candidates";
import { alertItemIncoming } from "../../src/services/admin-alerts";
import { createAdmin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createAttempt, createBuilding, createFoundItem, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
let A: number;
let placeId: number;
let otherPlaceId: number;
let guard: { id: string; token: string };

const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const close = (id: string, reason: unknown, t = guard.token) =>
  request(app).post(`/api/v1/admin/found-items/${id}/close`).set(as(t)).send({ reason });

async function adminLogin(email: string, place: number | null) {
  const admin = await createAdmin(email, "adminpass1", place);
  const token = (await request(app).post("/api/v1/admin/auth/login").send({ email, password: "adminpass1" })).body
    .accessToken as string;
  return { id: admin.id, token };
}

const handedOver = (over: Partial<Parameters<typeof createFoundItem>[0]> = {}) =>
  createFoundItem({
    buildingId: A,
    category: "EARPHONE",
    foundAt: hoursAgo(1),
    storageType: "HANDED_OVER",
    storagePlaceId: placeId,
    ...over,
  });

beforeEach(async () => {
  await resetDb();
  app = createApp();
  A = (await createBuilding("북악관")).id;
  placeId = (await createStoragePlace("혜인관 교무처", A)).id;
  otherPlaceId = (await createStoragePlace("청운관 경비실", A)).id;
  guard = await adminLogin("guard@skuniv.ac.kr", placeId);
});

describe("보관 종료", () => {
  it("폐기·이관: 행은 남기고 EXPIRED, 이유·처리자·시각 기록, 후보에서 빠지고 사진은 정기 작업 몫", async () => {
    const item = await handedOver();
    const res = await close(item.id, "DISPOSED");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "EXPIRED",
      closedReason: "DISPOSED",
      closedAt: expect.any(String),
      closedByEmailMasked: "gu****@skuniv.ac.kr",
    });
    const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id }, include: { detail: true } });
    expect(after).toMatchObject({ status: "EXPIRED", closedById: guard.id, closedReason: "DISPOSED" });
    expect(after.detail?.imageOriginalKey).not.toBeNull();

    const user = await signupUser(app);
    const report = await prisma.lostReport.create({
      data: {
        userId: user.user.id,
        category: "EARPHONE",
        lostFrom: hoursAgo(3),
        lostTo: hoursAgo(0),
        description: "테스트 물건",
        descriptionHash: "h",
      },
    });
    const candidates = await findCandidates(report, "USER");
    expect(candidates.map((c) => c.foundItemId)).not.toContain(item.id);
  });

  it("잘못 등록: 사진과 비공개 정보를 바로 지운다, 받아 간 QR은 만료", async () => {
    const item = await handedOver({ status: "REVEALED" });
    const user = await signupUser(app);
    const pickup = await prisma.pickup.create({
      data: { foundItemId: item.id, userId: user.user.id, method: "CENTER_QR", status: "ISSUED" },
    });
    const res = await close(item.id, "MISREGISTERED");
    expect(res.status).toBe(200);
    expect(res.body.originalImageUrl).toBeNull();
    const after = await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id }, include: { detail: true } });
    expect(after.dataPurgedAt).not.toBeNull();
    expect(after.detail?.description).toBeNull();
    expect((await prisma.pickup.findUniqueOrThrow({ where: { id: pickup.id } })).status).toBe("EXPIRED");
  });

  it("수령된 물건 409 ALREADY_CLAIMED, 이미 끝낸 물건·체험용 물건 409 NOT_CLOSABLE", async () => {
    const claimed = await handedOver({ status: "CLAIMED" });
    expect((await close(claimed.id, "DISPOSED")).body.error.code).toBe("ALREADY_CLAIMED");

    const once = await handedOver();
    expect((await close(once.id, "DISPOSED")).status).toBe(200);
    const twice = await close(once.id, "MISREGISTERED");
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("NOT_CLOSABLE");

    const seed = await handedOver({ isSeed: true });
    expect((await close(seed.id, "DISPOSED")).body.error.code).toBe("NOT_CLOSABLE");
  });

  it("관리 범위 밖 403, 일반 계정 403, 잘못된 이유 400", async () => {
    const other = await handedOver({ storagePlaceId: otherPlaceId });
    expect((await close(other.id, "DISPOSED")).status).toBe(403);
    const user = await signupUser(app);
    expect((await close(other.id, "DISPOSED", user.accessToken)).status).toBe(403);
    const item = await handedOver();
    expect((await close(item.id, "DELETE")).status).toBe(400);
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REGISTERED");
  });
});

describe("관리자 정보 알림", () => {
  it("맡긴 물건 등록: 담당 관리자에게 한 번, 공개 정보만, 그 자리에 둔 물건·시드는 안 보냄", async () => {
    const item = await handedOver({ subCategory: "WIRELESS_EARBUDS" });
    await prisma.foundItem.update({ where: { id: item.id }, data: { floor: -1 } });
    expect(await alertItemIncoming(item.id)).toBe(1);
    expect(await alertItemIncoming(item.id)).toBe(0); // 안 읽은 알림이 있으면 다시 만들지 않는다
    const [n] = await prisma.notification.findMany({ where: { userId: guard.id } });
    expect(n).toMatchObject({ type: "ITEM_INCOMING", foundItemId: item.id });
    expect(n?.message).toBe("북악관 지하 1층에서 주운 무선 이어폰을 맡긴다고 등록했어요. 실물이 오면 확인해 주세요.");

    const inPlace = await createFoundItem({ buildingId: A, category: "EARPHONE" });
    expect(await alertItemIncoming(inPlace.id)).toBe(0);
    const seed = await handedOver({ isSeed: true });
    expect(await alertItemIncoming(seed.id)).toBe(0);
  });

  it("수령 QR 발급: 담당 관리자에게 수령 예정, 다시 받아도 안 읽었으면 하나만", async () => {
    const item = await handedOver();
    const user = await signupUser(app);
    await createAttempt(user.user.id, item.id, { result: "PASS" });
    const qr = () => request(app).post(`/api/v1/found-items/${item.id}/pickup-qr`).set(as(user.accessToken));
    expect((await qr()).status).toBe(200);
    expect((await qr()).status).toBe(200);
    const rows = await prisma.notification.findMany({ where: { userId: guard.id, type: "PICKUP_SCHEDULED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toContain("수령 예정");
    expect(rows[0]?.message).toContain("24시간");

    const list = await request(app).get("/api/v1/notifications").set(as(guard.token));
    expect(list.status).toBe(200);
    expect(list.body.notifications.map((x: { type: string }) => x.type)).toEqual(["PICKUP_SCHEDULED"]);
  });
});
