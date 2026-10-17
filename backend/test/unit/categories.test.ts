// 물건 종류 24개 (#27): 이슈의 완료 기준 중 단위로 확인하는 것 (1, 3~8, 10)
import { readFileSync } from "node:fs";
import {
  CATEGORY_LABELS,
  CATEGORY_LOST112_CODES,
  Category,
  categoryFromLost112,
  RELATED_CATEGORIES,
  relatedCategories,
  VALUABLE_CATEGORIES,
} from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { createGeminiClient, type GeminiModels } from "../../src/ai/gemini";
import { mockAiClient } from "../../src/ai/mock";
import { EMBEDDING_DIM } from "../../src/ai/types";
import { Category as PrismaCategory } from "../../src/generated/prisma/enums";

describe("기준 1. 종류 24개, shared와 Prisma가 같고 모두 한국어 이름이 있다", () => {
  it("24개, 같은 값, 이름", () => {
    expect(Category.options).toHaveLength(24);
    expect(Object.values(PrismaCategory)).toEqual(Category.options);
    for (const c of Category.options) expect(CATEGORY_LABELS[c]).toMatch(/[가-힣]/);
    expect(new Set(Object.values(CATEGORY_LABELS)).size).toBe(24);
  });
});

describe("기준 3. 종류마다 LOST112 코드, 코드표에 있는 코드만", () => {
  const table = readFileSync(new URL("../../../docs/api/LOST112.md", import.meta.url), "utf8");
  const known = new Set<string>();
  for (const m of table.matchAll(/^\| (PR[A-Z]\d{3}) \| [^|]+ \| (PR[A-Z]\d{3}) \|/gm)) {
    known.add(`${m[1]}/${m[2]}`);
    known.add(`${m[1]}/`);
  }

  it("빈 종류 없음, 모든 코드가 코드표에 있다", () => {
    expect(known.size).toBeGreaterThan(50);
    for (const c of Category.options) {
      const codes = CATEGORY_LOST112_CODES[c];
      expect(codes.length, c).toBeGreaterThan(0);
      for (const { prdtCl01, prdtCl02 } of codes)
        expect(known, `${c} ${prdtCl01}/${prdtCl02}`).toContain(`${prdtCl01}/${prdtCl02 ?? ""}`);
    }
  });

  it("우산·텀블러·필기구·기타는 PRZ100, 열쇠는 자동차 열쇠 PRF100도", () => {
    for (const c of ["UMBRELLA", "TUMBLER", "STATIONERY", "ETC"] as const)
      expect(CATEGORY_LOST112_CODES[c]).toEqual([{ prdtCl01: "PRZ000", prdtCl02: "PRZ100" }]);
    expect(CATEGORY_LOST112_CODES.KEY).toContainEqual({ prdtCl01: "PRF000", prdtCl02: "PRF100" });
  });
});

describe("기준 4. LOST112 코드 → 우리 종류", () => {
  it("중분류가 한 종류에만 맞으면 그 종류", () => {
    expect(categoryFromLost112("PRN000", "PRN100")).toBe("ID_CARD");
    expect(categoryFromLost112("PRP000", "PRP400")).toBe("TRANSIT_CARD");
    expect(categoryFromLost112("PRG000", "PRG900")).toBe("EARPHONE");
    expect(categoryFromLost112("PRK000", "PRK500")).toBe("HAT");
    expect(categoryFromLost112("PRF000", "PRF100")).toBe("KEY");
  });

  it("대분류 전체로 묶인 종류는 중분류가 무엇이든 그 종류", () => {
    expect(categoryFromLost112("PRH000", "PRH200")).toBe("WALLET");
    expect(categoryFromLost112("PRJ000", "PRJ400")).toBe("PHONE");
    expect(categoryFromLost112("PRO000", "PRO400")).toBe("ACCESSORY");
    expect(categoryFromLost112("PRI000")).toBe("LAPTOP");
  });

  it("여러 종류가 같이 쓰는 PRZ100, 매핑 밖 코드, 모르는 코드는 ETC", () => {
    expect(categoryFromLost112("PRZ000", "PRZ100")).toBe("ETC");
    expect(categoryFromLost112("PRG000", "PRG400")).toBe("ETC"); // 카메라
    expect(categoryFromLost112("PRF000", "PRF200")).toBe("ETC"); // 네비게이션
    expect(categoryFromLost112("PRX999", null)).toBe("ETC");
  });
});

describe("기준 5. 연관 묶음은 대칭, 자기 자신 없음", () => {
  it("모든 쌍", () => {
    for (const [a, list] of Object.entries(RELATED_CATEGORIES) as [Category, Category[]][]) {
      expect(list, a).not.toContain(a);
      expect(new Set(list).size, a).toBe(list.length);
      for (const b of list) {
        expect(Category.options).toContain(b);
        expect(RELATED_CATEGORIES[b], `${b} → ${a}`).toContain(a);
      }
    }
  });
});

describe("기준 6. 연관 묶음 내용", () => {
  const rel = (c: Category) => relatedCategories(c);
  it("지갑↔카드·신분증·현금", () => {
    expect(rel("WALLET")).toEqual(
      expect.arrayContaining(["ID_CARD", "DRIVER_LICENSE", "PAYMENT_CARD", "TRANSIT_CARD", "OTHER_CARD", "CASH"]),
    );
  });
  it("노트북↔태블릿↔충전기, 휴대폰·이어폰·스마트워치↔충전기", () => {
    expect(rel("LAPTOP")).toEqual(expect.arrayContaining(["TABLET", "CHARGER"]));
    expect(rel("TABLET")).toEqual(expect.arrayContaining(["LAPTOP", "CHARGER"]));
    expect(rel("CHARGER")).toEqual(expect.arrayContaining(["PHONE", "EARPHONE", "SMARTWATCH", "LAPTOP", "TABLET"]));
  });
  it("가방↔의류↔모자, 교재↔필기구, 스마트워치↔시계·액세서리", () => {
    expect(rel("CLOTHING")).toEqual(expect.arrayContaining(["BAG", "HAT"]));
    expect(rel("BOOK")).toContain("STATIONERY");
    expect(rel("ACCESSORY")).toContain("SMARTWATCH");
  });
  it("묶음 밖은 들어가지 않는다", () => {
    expect(rel("UMBRELLA")).toEqual(["UMBRELLA", "ETC"]);
    expect(rel("WALLET")).not.toContain("LAPTOP");
  });
});

describe("기준 7. 고가품", () => {
  it("돈·신분·결제·비싼 전자기기·귀금속", () => {
    expect([...VALUABLE_CATEGORIES].sort()).toEqual(
      [
        "WALLET",
        "ID_CARD",
        "DRIVER_LICENSE",
        "PAYMENT_CARD",
        "PHONE",
        "EARPHONE",
        "SMARTWATCH",
        "TABLET",
        "LAPTOP",
        "ACCESSORY",
        "CASH",
      ].sort(),
    );
  });
});

describe("기준 8. Gemini 응답 스키마와 프롬프트가 24개 기준", () => {
  it("enum 24개, 프롬프트에 키·한국어 이름·헷갈리는 경우 규칙", async () => {
    const calls: Parameters<GeminiModels["generateContent"]>[0][] = [];
    const models = {
      async generateContent(params: (typeof calls)[number]) {
        calls.push(params);
        return {
          text: JSON.stringify({
            hasObject: true,
            category: "KEY",
            categoryAlt: null,
            color: null,
            brand: null,
            features: [],
            description: "자동차 스마트키",
            isSensitive: false,
            sensitiveBoxes: [],
            title: "자동차 스마트키",
          }),
        };
      },
      async embedContent() {
        return { embeddings: [{ values: Array.from({ length: EMBEDDING_DIM }, () => 1) }] };
      },
    } as unknown as GeminiModels;
    const out = await createGeminiClient(models, {
      model: "lite",
      fallbackModel: "flash",
      embedModel: "e",
    }).extractFoundItem(Buffer.from("x"), "image/jpeg");
    expect(out.category).toBe("KEY");
    const config = calls[0]?.config as { responseJsonSchema: { properties: Record<string, { enum?: string[] }> } };
    expect(config.responseJsonSchema.properties.category?.enum).toEqual(Category.options);
    const prompt = String(calls[0]?.config?.systemInstruction);
    for (const c of Category.options) expect(prompt).toContain(`${c}(${CATEGORY_LABELS[c]})`);
    expect(prompt).toContain("자동차 열쇠");
    expect(prompt).toContain("PAYMENT_CARD");
  });
});

describe("기준 10. 가짜 AI 키워드도 24개 기준", () => {
  it("신고 설명 낱말로 종류를 고른다", async () => {
    const cases: [string, Category][] = [
      ["검정 아이폰 15", "PHONE"],
      ["흰색 에어팟", "EARPHONE"],
      ["애플워치 실버", "SMARTWATCH"],
      ["손목 시계", "ACCESSORY"],
      ["현대차 차키", "KEY"],
      ["집 열쇠 꾸러미", "KEY"],
      ["검은 뿔테 안경", "GLASSES"],
      ["현금 5만원", "CASH"],
      ["학생증", "ID_CARD"],
      ["티머니 교통카드", "TRANSIT_CARD"],
      ["갈색 반지갑", "WALLET"],
      ["아이패드 미니", "TABLET"],
      ["맥북 에어", "LAPTOP"],
      ["검정 백팩", "BAG"],
      ["회색 후드", "CLOTHING"],
      ["전공 교재", "BOOK"],
      ["파란 필통", "STATIONERY"],
      ["무언가", "ETC"],
    ];
    for (const [text, category] of cases)
      expect((await mockAiClient.extractLostReport(text)).category, text).toBe(category);
  });
});
