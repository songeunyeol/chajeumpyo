// 주인 확인(F-07~F-09) 평가: 진짜 주인 설명과 사칭 설명으로 후보 노출·판정 결과를 잰다.
// 실행 (평가용 DB에서만. 운영 DB에서 돌리지 않는다):
//   npm run db:deploy -w backend && npm run db:seed -w backend
//   AI_MODE=gemini npm run eval:claims -w backend > 결과.md
// 체험용 시드 14개를 넣고, 물건마다 4가지 설명(특징 그대로 / 바꿔 말함 / 특징 없음 / 사칭)으로 체험 계정 신고를 만든다.
// 객관식 확인 질문이 나오면 주인 쪽은 정답을, 사칭 쪽은 늘 첫 보기를 고른다(찍기). 결과를 표로 찍는다.
import type { Category } from "@chajeumpyo/shared";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { quizOf } from "../src/matching/quiz";
import { answer, claim } from "../src/services/claims";
import { DEMO_SEED_ITEMS, seedDemoItems } from "../src/services/demo-seed";
import { createLostReport } from "../src/services/lost-reports";

if (env.NODE_ENV === "production") {
  console.error("운영 환경에서는 돌리지 않아요.");
  process.exit(1);
}

type Kind = "그대로" | "바꿔 말함" | "특징 없음" | "사칭";
const KINDS: Kind[] = ["그대로", "바꿔 말함", "특징 없음", "사칭"];

/** 시드 번호(id 끝 세 자리) → 설명 4가지 */
const CASES: Record<string, Record<Kind, string>> = {
  "001": {
    그대로: "흰색 에어팟을 잃어버렸어요. 케이스 앞면에 곰돌이 스티커가 붙어 있어요.",
    "바꿔 말함": "하얀 무선 이어폰이에요. 케이스에 곰 캐릭터 스티커를 붙여 놨어요.",
    "특징 없음": "흰색 무선 이어폰을 잃어버렸어요.",
    사칭: "흰색 무선 이어폰이에요. 케이스에 토끼 스티커가 붙어 있어요.",
  },
  "002": {
    그대로: "갈색 반지갑이에요. 안쪽에 J.H 각인이 있고 영화 티켓 한 장이 들어 있어요.",
    "바꿔 말함": "갈색 지갑인데 안에 이니셜 JH가 새겨져 있어요. 영화표도 하나 있었어요.",
    "특징 없음": "갈색 지갑을 잃어버렸어요.",
    사칭: "갈색 지갑이에요. 안에 학생증이랑 현금 만 원이 있어요.",
  },
  "003": {
    그대로: "검정 우산이에요. 회색 줄무늬가 있고 손잡이에 고양이 키링이 달려 있어요.",
    "바꿔 말함": "까만 장우산이에요. 회색 스트라이프 무늬고 손잡이에 냥이 키링 달려 있어요.",
    "특징 없음": "검정 우산을 잃어버렸어요.",
    사칭: "검정 우산이에요. 손잡이에 강아지 키링이 달려 있어요.",
  },
  "004": {
    그대로: "파란 스탠리 텀블러예요. 옆면에 펭귄 스티커가 있고 바닥이 찌그러져 있어요.",
    "바꿔 말함": "파란색 스탠리 물병이에요. 펭귄 그림 스티커가 붙어 있고 밑바닥이 좀 찌그러졌어요.",
    "특징 없음": "파란 텀블러를 잃어버렸어요.",
    사칭: "파란 텀블러예요. 옆에 꽃무늬 스티커가 붙어 있어요.",
  },
  "005": {
    그대로: "검정 아이폰이에요. 투명 케이스이고 케이스 안에 별 스티커가 있어요.",
    "바꿔 말함": "까만 아이폰인데 투명한 케이스 끼웠고 안쪽에 노란 별 모양 스티커를 넣어 뒀어요.",
    "특징 없음": "검정 휴대폰을 잃어버렸어요.",
    사칭: "검정 아이폰이에요. 빨간 가죽 케이스를 끼웠어요.",
  },
  "006": {
    그대로: "현대 자동차 키예요. 갈색 가죽 키케이스에 빨간 하트 키링이 달려 있어요.",
    "바꿔 말함": "현대 차 스마트키인데 갈색 가죽 커버 씌웠고 빨간 하트 모양 고리가 달려 있어요.",
    "특징 없음": "자동차 키를 잃어버렸어요.",
    사칭: "자동차 키예요. 파란 고무 케이스에 곰 키링이 달려 있어요.",
  },
  "007": {
    그대로: "회색 백팩이에요. 지퍼에 노란 오리 인형 키링이 있고 앞주머니에 별 자수가 있어요.",
    "바꿔 말함": "회색 책가방이에요. 지퍼에 노란 오리 인형을 달아 놨고 앞쪽 주머니에 별 모양 수가 놓여 있어요.",
    "특징 없음": "회색 백팩을 잃어버렸어요.",
    사칭: "회색 백팩이에요. 옆에 학교 로고 배지가 달려 있어요.",
  },
  "008": {
    그대로: "분홍 필통이에요. 앞에 딸기 스티커가 있고 안에 초록색 형광펜이 들어 있어요.",
    "바꿔 말함": "핑크색 필통인데 딸기 그림 스티커 붙어 있고 연두색 형광펜 하나 들어 있어요.",
    "특징 없음": "분홍 필통을 잃어버렸어요.",
    사칭: "분홍 필통이에요. 안에 샤프 두 자루랑 지우개가 있어요.",
  },
  "009": {
    그대로: "검정 안경이에요. 빨간 안경집에 들어 있고 왼쪽 렌즈에 긁힘이 있어요.",
    "바꿔 말함": "검은 뿔테 안경인데 빨간색 케이스에 넣어 뒀어요. 왼쪽 알에 스크래치가 있어요.",
    "특징 없음": "검정 안경을 잃어버렸어요.",
    사칭: "검정 안경이에요. 파란 안경집에 들어 있어요.",
  },
  "010": {
    그대로: "삼성 은색 노트북이에요. 덮개에 우주인 스티커가 있고 키보드에 투명 덮개를 씌웠어요.",
    "바꿔 말함": "은색 갤럭시북이에요. 뚜껑에 우주비행사 스티커 붙였고 키보드 커버 씌워 놨어요.",
    "특징 없음": "은색 노트북을 잃어버렸어요.",
    사칭: "은색 노트북이에요. 뚜껑에 고양이 스티커가 여러 개 붙어 있어요.",
  },
  "011": {
    그대로: "초록 아우터예요. 등에 흰 체크무늬 패치가 있고 주머니에 귤 사탕이 있어요.",
    "바꿔 말함": "초록색 겉옷인데 등 쪽에 하얀 체크 패치가 붙어 있고 주머니에 귤맛 사탕 넣어 뒀어요.",
    "특징 없음": "초록 겉옷을 잃어버렸어요.",
    사칭: "초록 아우터예요. 왼쪽 소매에 브랜드 로고 자수가 있어요.",
  },
  "012": {
    그대로: "파란 교과서예요. 속지에 연필로 쓴 이니셜 S.K가 있고 노란 포스트잇이 여러 장 붙어 있어요.",
    "바꿔 말함": "파란 전공책인데 첫 장에 SK라고 이니셜 적어 놨고 노란 메모지를 잔뜩 붙였어요.",
    "특징 없음": "파란 교과서를 잃어버렸어요.",
    사칭: "파란 교과서예요. 겉표지에 제 이름이 매직으로 적혀 있어요.",
  },
  "013": {
    그대로: "흰 보조배터리예요. 무지개 스티커가 있고 짧은 C타입 케이블이 꽂혀 있어요.",
    "바꿔 말함": "하얀 보조배터리인데 무지개 그림 스티커 붙어 있고 짧은 USB-C 선이 꽂혀 있어요.",
    "특징 없음": "흰 보조배터리를 잃어버렸어요.",
    사칭: "흰 보조배터리예요. 옆면에 검정 매직으로 이름을 써 놨어요.",
  },
  "014": {
    그대로: "분홍 애플워치예요. 분홍 실리콘 밴드이고 화면 오른쪽 위에 작은 금이 있어요.",
    "바꿔 말함": "핑크색 애플워치인데 핑크 고무 밴드 끼웠고 액정 우측 상단에 살짝 금 갔어요.",
    "특징 없음": "분홍 스마트워치를 잃어버렸어요.",
    사칭: "분홍 애플워치예요. 하얀 가죽 밴드를 끼웠어요.",
  },
};

type Row = { seed: string; kind: Kind; inTop3: boolean; first: string; final: string };

const now = new Date();
await seedDemoItems(now);
const rows: Row[] = [];
let n = 0;
for (const item of DEMO_SEED_ITEMS) {
  const seed = item.id.slice(-3);
  const building = await prisma.building.findUniqueOrThrow({ where: { name: item.building } });
  for (const kind of KINDS) {
    n++;
    // 판정 횟수가 섞이지 않게 설명마다 새 체험 계정
    const user = await prisma.user.create({
      data: { email: `eval-${Date.now()}-${n}@skuniv.ac.kr`, passwordHash: "x", role: "DEMO" },
    });
    const viewer = { userId: user.id, role: "DEMO" as const };
    const created = await createLostReport(viewer, {
      category: (item as unknown as { category: Category }).category,
      lostFrom: new Date(now.getTime() - 10 * 3600_000).toISOString(),
      lostTo: now.toISOString(),
      buildingId: building.id,
      description: CASES[seed]?.[kind] ?? "",
    });
    const inTop3 = created.candidates.some((c) => c.foundItemId === item.id);
    if (!inTop3) {
      rows.push({ seed, kind, inTop3, first: "후보 아님", final: "후보 아님" });
      continue;
    }
    const r = await claim(viewer, created.id, item.id);
    let final: string = r.result;
    if (r.result === "BORDERLINE") {
      const attempt = await prisma.matchAttempt.findUniqueOrThrow({ where: { id: r.attemptId } });
      const quiz = quizOf(attempt.matchedFields);
      const choices = kind === "사칭" ? quiz.map(() => 0) : quiz.map((q) => q.answer);
      final = quiz.length
        ? `질문 ${quiz.length}개 → ${(await answer(viewer, r.attemptId, { choices })).result}`
        : "질문(서술형)";
    }
    rows.push({ seed, kind, inTop3, first: r.result, final });
    console.error(`${seed} ${kind}: ${inTop3 ? "후보" : "-"} ${r.result} → ${final}`);
  }
}

console.log("| 시드 | 설명 | 후보 3개 안 | 1단계 판정 | 최종 |");
console.log("| --- | --- | --- | --- | --- |");
for (const r of rows)
  console.log(`| ${r.seed} | ${r.kind} | ${r.inTop3 ? "예" : "아니오"} | ${r.first} | ${r.final} |`);
console.log("");
for (const kind of KINDS) {
  const k = rows.filter((r) => r.kind === kind);
  const top3 = k.filter((r) => r.inTop3).length;
  const passFirst = k.filter((r) => r.first === "PASS").length;
  const passFinal = k.filter((r) => r.final === "PASS" || r.final.endsWith("PASS")).length;
  const border = k.filter((r) => r.first === "BORDERLINE").length;
  const fail = k.filter((r) => r.first === "FAIL").length;
  console.log(
    `- ${kind} (${k.length}건): 후보 3개 안 ${top3}, 1단계 통과 ${passFirst}, 확인 질문 ${border}, 1단계 실패 ${fail}, 최종 통과 ${passFinal}`,
  );
}
await prisma.$disconnect();
