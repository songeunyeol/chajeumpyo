// 심사위원 체험용 시드 습득물 8개 넣기 (F-05). 숨은 특징은 docs/demo-scenario.md.
// 건물·보관처가 먼저 있어야 한다: npm run db:seed -w backend → npm run seed:demo -w backend
// 고정 id로 upsert해서 여러 번 돌려도 늘지 않는다. 돌릴 때마다 상태·속성·사진·습득 시각을 처음 값으로 되돌린다.
// 배포 서버(production DB)에서도 쓰는 스크립트라 개발 DB 전용 확인을 하지 않는다.
import { prisma } from "../src/lib/prisma";
import { DEMO_SEED_ITEMS, seedDemoItems } from "../src/services/demo-seed";

try {
  const { created, updated } = await seedDemoItems();
  console.log(`체험용 시드 습득물 ${DEMO_SEED_ITEMS.length}개: 새로 ${created}개, 고침 ${updated}개`);
} finally {
  await prisma.$disconnect();
}
