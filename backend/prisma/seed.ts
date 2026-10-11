import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StorageOrg } from "@chajeumpyo/shared";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";

const Buildings = z.array(
  z.object({ name: z.string().min(1), lat: z.number(), lng: z.number(), sortOrder: z.number().int().default(0) }),
);
const StoragePlaces = z.array(
  z.object({ name: z.string().min(1), building: z.string().min(1), guideText: z.string().min(1), org: StorageOrg }),
);

function load<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, "seed-data", file), "utf8"));
  return schema.parse(raw);
}

async function main() {
  const buildings = load("buildings.json", Buildings);
  for (const b of buildings) {
    await prisma.building.upsert({ where: { name: b.name }, update: b, create: b });
  }

  const places = load("storage-places.json", StoragePlaces);
  for (const p of places) {
    const building = await prisma.building.findUnique({ where: { name: p.building } });
    if (!building) throw new Error(`보관처 "${p.name}"의 건물 "${p.building}"이 buildings.json에 없어요.`);
    const data = { name: p.name, buildingId: building.id, guideText: p.guideText, org: p.org };
    await prisma.storagePlace.upsert({ where: { name: p.name }, update: data, create: data });
  }

  console.log(`건물 ${buildings.length}개, 보관처 ${places.length}개를 넣었어요.`);
  if (buildings.length === 0) console.log("prisma/seed-data/README.md를 보고 건물 목록을 채워 주세요.");
}

main().finally(() => prisma.$disconnect());
