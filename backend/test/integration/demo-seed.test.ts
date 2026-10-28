// 심사위원 체험용 시드 (F-05, scripts/seed-demo.ts): 여러 번 돌려도 늘지 않고, 체험 계정에만 보이고, 지워지지 않는다
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { resetAiClient } from "../../src/ai";
import { createApp } from "../../src/app";
import { expireUnclaimedItems, purgeClaimedItems } from "../../src/services/data-purge";
import { DEMO_SEED_ITEMS, refreshDemoSeedDates, seedDemoItems } from "../../src/services/demo-seed";
import { readLocalFile } from "../../src/storage/local";
import { demoLogin, signupUser } from "../helpers/auth";
import { prisma, resetDb } from "../helpers/db";
import { createBuilding, createStoragePlace, hoursAgo } from "../helpers/fixtures";

let app: ReturnType<typeof createApp>;
const ids = DEMO_SEED_ITEMS.map((i) => i.id);
const EARPHONE = DEMO_SEED_ITEMS[0] as (typeof DEMO_SEED_ITEMS)[number];

async function seedPlaces() {
  const names = [...new Set([...DEMO_SEED_ITEMS.map((i) => i.building), "본관"])];
  const byName = new Map<string, number>();
  for (const n of names) byName.set(n, (await createBuilding(n)).id);
  await createStoragePlace("종합서비스센터", byName.get("본관") as number, "CENTER");
  await createStoragePlace("유담관 경비실", byName.get("유담관") as number);
  await createStoragePlace("청운관 경비실", byName.get("청운관") as number);
  return byName;
}

const embeddingCount = async () =>
  Number(
    (
      await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM found_item_detail WHERE embedding IS NOT NULL`
    )[0]?.n ?? 0,
  );

beforeEach(async () => {
  await resetDb();
  resetAiClient();
  app = createApp();
});

describe("seedDemoItems", () => {
  it("건물·보관처가 없으면 안내와 함께 멈춘다", async () => {
    await expect(seedDemoItems()).rejects.toThrow("db:seed");
    expect(await prisma.foundItem.count()).toBe(0);
  });

  it("두 번 돌려도 시드 8개 그대로, 사진·임베딩·숨은 특징이 있고 기한이 없다", async () => {
    await seedPlaces();
    expect(await seedDemoItems()).toEqual({ created: DEMO_SEED_ITEMS.length, updated: 0 });
    expect(await seedDemoItems()).toEqual({ created: 0, updated: DEMO_SEED_ITEMS.length });

    const items = await prisma.foundItem.findMany({ include: { detail: true } });
    expect(items).toHaveLength(DEMO_SEED_ITEMS.length);
    expect(await prisma.foundItemDetail.count()).toBe(DEMO_SEED_ITEMS.length);
    expect(await embeddingCount()).toBe(DEMO_SEED_ITEMS.length);
    for (const it of items) {
      expect(it.isSeed).toBe(true);
      expect(it.status).toBe("REGISTERED");
      expect(it.expiresAt).toBeNull();
      expect(it.category).not.toBeNull();
      expect(it.detail?.features).not.toEqual([]);
      for (const key of [it.detail?.imageOriginalKey, it.detail?.imagePublicKey, it.detail?.imageThumbKey]) {
        expect(await readLocalFile(key as string)).not.toBeNull();
      }
    }
  });

  it("상태가 바뀌어 있어도 다시 돌리면 처음 값으로 되돌린다", async () => {
    await seedPlaces();
    await seedDemoItems();
    await prisma.foundItem.update({ where: { id: EARPHONE.id }, data: { status: "CLAIMED", foundAt: hoursAgo(500) } });
    await prisma.foundItemDetail.update({ where: { foundItemId: EARPHONE.id }, data: { title: "바뀐 제목" } });
    await seedDemoItems();
    const item = await prisma.foundItem.findUniqueOrThrow({ where: { id: EARPHONE.id }, include: { detail: true } });
    expect(item.status).toBe("REGISTERED");
    expect(item.detail?.title).toBe(EARPHONE.title);
    expect(item.foundAt.getTime()).toBeGreaterThan(hoursAgo(24).getTime());
  });

  it("같은 id의 실제 습득물은 덮어쓰지 않는다", async () => {
    const b = await seedPlaces();
    await prisma.foundItem.create({
      data: { id: EARPHONE.id, buildingId: b.get("혜인관") as number, storageType: "IN_PLACE", status: "REGISTERED" },
    });
    await expect(seedDemoItems()).rejects.toThrow("시드가 아닌");
  });
});

describe("시드는 지워지지 않고, 습득 시각만 최근으로 당겨진다", () => {
  it("만료·삭제 작업은 시드를 건드리지 않는다", async () => {
    await seedPlaces();
    await seedDemoItems();
    const farFuture = new Date(Date.now() + 365 * 86_400_000);
    expect(await expireUnclaimedItems(farFuture)).toBe(0);
    expect(await purgeClaimedItems(farFuture)).toBe(0);
    expect(await prisma.foundItem.count({ where: { isSeed: true, status: "REGISTERED", dataPurgedAt: null } })).toBe(
      DEMO_SEED_ITEMS.length,
    );
  });

  it("refreshDemoSeedDates는 시드의 습득 시각만 고친다", async () => {
    await seedPlaces();
    await seedDemoItems(new Date(Date.now() - 10 * 86_400_000));
    expect(await refreshDemoSeedDates()).toBe(DEMO_SEED_ITEMS.length);
    const oldest = await prisma.foundItem.findFirstOrThrow({ where: { id: { in: ids } }, orderBy: { foundAt: "asc" } });
    expect(oldest.foundAt.getTime()).toBeGreaterThan(hoursAgo(24).getTime());
  });
});

describe("체험 흐름: 숨은 특징을 말하면 통과", () => {
  it("체험 계정 후보에는 시드가 나오고 숨은 특징으로 통과, 일반 계정에는 안 나온다", async () => {
    const b = await seedPlaces();
    await seedDemoItems();
    const report = {
      category: "EARPHONE",
      lostFrom: hoursAgo(12).toISOString(),
      lostTo: new Date().toISOString(),
      buildingId: b.get("혜인관"),
      description: "흰색 에어팟, 케이스에 곰돌이 스티커가 붙어 있어요",
    };
    const post = (t: string) =>
      request(app).post("/api/v1/lost-reports").set("Authorization", `Bearer ${t}`).send(report);

    const demo = await demoLogin(app);
    const mine = await post(demo.accessToken);
    expect(mine.status).toBe(201);
    const candidateIds = mine.body.candidates.map((c: { foundItemId: string }) => c.foundItemId);
    expect(candidateIds).toContain(EARPHONE.id);

    const claim = await request(app)
      .post(`/api/v1/lost-reports/${mine.body.id}/claims`)
      .set("Authorization", `Bearer ${demo.accessToken}`)
      .send({ foundItemId: EARPHONE.id });
    expect(claim.body.result).toBe("PASS");
    // 체험 계정이 통과해도 시드 상태는 그대로 (다음 심사위원도 처음부터)
    expect((await prisma.foundItem.findUniqueOrThrow({ where: { id: EARPHONE.id } })).status).toBe("REGISTERED");

    const user = await signupUser(app);
    const theirs = await post(user.accessToken);
    expect(theirs.body.candidates).toEqual([]);
  });
});
