// 후보 순위(F-07) 평가: "임베딩 유사도만"으로 줄 세웠을 때와 지금 점수식(종류·장소·시간·설명)을 같은 세트로 비교한다.
// 실행 (평가용 DB에서만. 운영 DB에서 돌리지 않는다):
//   npm run db:deploy -w backend && npm run db:seed -w backend
//   AI_MODE=gemini npm run eval:ranking -w backend > 결과.md
// 체험용 시드 14개에, 물건마다 헷갈리는 물건 2개를 더 넣는다.
//   A: 같은 건물·같은 종류·같은 색, 특징만 다름(사칭 설명) / B: 다른 건물에서 주운, 주인 설명과 거의 같은 물건(그대로 설명)
// 시드마다 설명 3가지(그대로 / 바꿔 말함 / 특징 없음)로 신고를 만들고, 진짜 물건이 1등·3등 안에 드는지 센다.
import { type Category, CONSENT_VERSION } from "@chajeumpyo/shared";
import { ai } from "../src/ai";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { findCandidates } from "../src/matching/candidates";
import { setFoundItemEmbedding, similarityToFoundItems } from "../src/repositories/embedding";
import { DEMO_SEED_ITEMS, seedDemoItems } from "../src/services/demo-seed";
import { createLostReport } from "../src/services/lost-reports";
import { CASES, type Kind } from "./eval-cases";

if (env.NODE_ENV === "production") {
  console.error("운영 환경에서는 돌리지 않아요.");
  process.exit(1);
}

const KINDS: Kind[] = ["그대로", "바꿔 말함", "특징 없음"];
const now = new Date();
await seedDemoItems(now);

/** 시드 id 끝 세 자리 앞자리를 바꾼 헷갈리는 물건 id (1xx: 같은 건물, 2xx: 다른 건물) */
const decoyId = (id: string, kind: 1 | 2) => `${id.slice(0, -3)}${kind}${id.slice(-2)}`;
const buildings = await prisma.building.findMany({ orderBy: { sortOrder: "asc" } });
for (const item of DEMO_SEED_ITEMS) {
  const seed = item.id.slice(-3);
  const here = buildings.find((b) => b.name === item.building);
  if (!here) throw new Error(`건물 ${item.building}이 없어요.`);
  const elsewhere = buildings[(buildings.indexOf(here) + 1) % buildings.length] ?? here;
  const seedRow = await prisma.foundItem.findUniqueOrThrow({ where: { id: item.id }, select: { foundAt: true } });
  // A: 같은 건물·같은 종류·같은 색, 특징만 다름(사칭 설명). B: 다른 건물, 주인 설명과 거의 같은 물건(그대로 설명)
  const decoys = [
    { id: decoyId(item.id, 1), buildingId: here.id, description: CASES[seed]?.사칭 ?? "", label: "같은 건물" },
    { id: decoyId(item.id, 2), buildingId: elsewhere.id, description: CASES[seed]?.그대로 ?? "", label: "다른 건물" },
  ];
  for (const d of decoys) {
    const embedding = await ai.embed(d.description);
    await prisma.foundItem.deleteMany({ where: { id: d.id, isSeed: true } });
    await prisma.foundItem.create({
      data: {
        id: d.id,
        buildingId: d.buildingId,
        category: item.category,
        subCategory: item.subCategory,
        storageType: "IN_PLACE",
        floor: item.floor,
        status: "REGISTERED",
        isSeed: true,
        foundAt: seedRow.foundAt,
        expiresAt: null,
        consentVersion: CONSENT_VERSION,
        locationConsent: false,
        detail: {
          create: {
            isSensitive: false,
            color: item.color,
            brand: null,
            features: [],
            description: d.description,
            title: `${item.title} (헷갈리는 물건, ${d.label})`,
            locationDetail: item.locationDetail,
            rawAiResponse: { source: "eval-ranking" },
          },
        },
      },
    });
    await setFoundItemEmbedding(d.id, embedding);
  }
}

const decoyIds = DEMO_SEED_ITEMS.flatMap((i) => [decoyId(i.id, 1), decoyId(i.id, 2)]);
const allIds = [...DEMO_SEED_ITEMS.map((i) => i.id), ...decoyIds];
type Row = { seed: string; kind: Kind; embRank: number; oursTop1: boolean; oursTop3: boolean };
const rows: Row[] = [];
let n = 0;
for (const item of DEMO_SEED_ITEMS) {
  const seed = item.id.slice(-3);
  const building = await prisma.building.findUniqueOrThrow({ where: { name: item.building } });
  for (const kind of KINDS) {
    n++;
    const user = await prisma.user.create({
      data: { email: `rank-${Date.now()}-${n}@skuniv.ac.kr`, passwordHash: "x", role: "DEMO" },
    });
    const viewer = { userId: user.id, role: "DEMO" as const };
    const created = await createLostReport(viewer, {
      category: item.category as Category,
      lostFrom: new Date(now.getTime() - 10 * 3600_000).toISOString(),
      lostTo: now.toISOString(),
      buildingId: building.id,
      description: CASES[seed]?.[kind] ?? "",
    });
    const report = await prisma.lostReport.findUniqueOrThrow({
      where: { id: created.id },
      select: {
        id: true,
        userId: true,
        category: true,
        lostFrom: true,
        lostTo: true,
        buildingId: true,
        status: true,
        extractedAttributes: true,
      },
    });

    // 기준값: 종류·장소·시간을 보지 않고 42개 전체를 임베딩 유사도로만 줄 세운다
    const sim = await similarityToFoundItems(report.id, allIds);
    const byEmb = [...sim.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const embRank = byEmb.indexOf(item.id) + 1;

    // 지금 점수식: 후보 3개를 점수 순으로
    const ours = (await findCandidates(report, "DEMO")).sort((a, b) => b.score.total - a.score.total);
    rows.push({
      seed,
      kind,
      embRank,
      oursTop1: ours[0]?.foundItemId === item.id,
      oursTop3: ours.some((c) => c.foundItemId === item.id),
    });
    console.error(
      `${seed} ${kind}: 임베딩만 ${embRank}등, 점수식 ${ours.findIndex((c) => c.foundItemId === item.id) + 1}등`,
    );
  }
}

console.log("| 시드 | 설명 | 임베딩만 순위(42개 중) | 점수식 1등 | 점수식 3개 안 |");
console.log("| --- | --- | --- | --- | --- |");
for (const r of rows)
  console.log(
    `| ${r.seed} | ${r.kind} | ${r.embRank} | ${r.oursTop1 ? "예" : "아니오"} | ${r.oursTop3 ? "예" : "아니오"} |`,
  );
console.log("");
console.log("| 설명 | 건수 | 임베딩만 1등 | 임베딩만 3개 안 | 점수식 1등 | 점수식 3개 안 |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const kind of [...KINDS, "전체"] as const) {
  const k = kind === "전체" ? rows : rows.filter((r) => r.kind === kind);
  const c = (f: (r: Row) => boolean) => `${k.filter(f).length}/${k.length}`;
  console.log(
    `| ${kind} | ${k.length} | ${c((r) => r.embRank === 1)} | ${c((r) => r.embRank <= 3)} | ${c((r) => r.oursTop1)} | ${c((r) => r.oursTop3)} |`,
  );
}
await prisma.foundItem.deleteMany({ where: { id: { in: decoyIds } } });
await prisma.$disconnect();
