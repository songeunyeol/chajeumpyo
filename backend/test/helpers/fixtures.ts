import type { Category } from "@chajeumpyo/shared";
import { mockAiClient } from "../../src/ai/mock";
import { setFoundItemEmbedding } from "../../src/repositories/embedding";
import { prisma } from "./db";

export async function createBuilding(name: string, lat = 37.6, lng = 127) {
  return prisma.building.create({ data: { name, lat, lng } });
}

type FoundOpts = {
  buildingId: number;
  category: Category | null;
  categoryAlt?: Category | null;
  foundAt?: Date;
  status?: "ANALYZING" | "REVIEW" | "REGISTERED" | "REVEALED" | "CLAIMED" | "EXPIRED";
  isSeed?: boolean;
  expiresAt?: Date | null;
  color?: string | null;
  brand?: string | null;
  features?: { key: string; value: string }[];
  description?: string;
  storageType?: "IN_PLACE" | "HANDED_OVER";
  storagePlaceId?: number | null;
};

/** 등록 API를 거치지 않고 습득물을 바로 만든다. 임베딩은 mock과 같은 방식(같은 설명이면 유사도 1). */
export async function createFoundItem(o: FoundOpts) {
  const description = o.description ?? "테스트 물건";
  const item = await prisma.foundItem.create({
    data: {
      buildingId: o.buildingId,
      category: o.category,
      categoryAlt: o.categoryAlt ?? null,
      storageType: o.storageType ?? "IN_PLACE",
      storagePlaceId: o.storagePlaceId ?? null,
      status: o.status ?? "REGISTERED",
      isSeed: o.isSeed ?? false,
      foundAt: o.foundAt ?? new Date(),
      expiresAt: o.expiresAt === undefined ? new Date(Date.now() + 30 * 86_400_000) : o.expiresAt,
      detail: {
        create: {
          imageOriginalKey: "test/original.jpg",
          imagePublicKey: "test/public.jpg",
          imageThumbKey: "test/thumb.jpg",
          color: o.color ?? null,
          brand: o.brand ?? null,
          features: o.features ?? [],
          description,
        },
      },
    },
  });
  await setFoundItemEmbedding(item.id, await mockAiClient.embed(description));
  return item;
}

export const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
