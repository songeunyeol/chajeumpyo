import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// 신고 화면이 물건 이름으로 종류를 미리 고르는 규칙(frontend/lost/api.js CATEGORY_WORDS).
// 브라우저 없이 api.js를 불러 LostApi.guessCategory·guessSubCategory만 쓴다.
type LostApi = {
  guessCategory: (text: string) => string | null;
  guessSubCategory: (category: string, text: string) => string | null;
};

function loadLostApi(): LostApi {
  const src = readFileSync(new URL("../../../frontend/lost/api.js", import.meta.url), "utf8");
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const window: Record<string, unknown> = {
    location: { hostname: "localhost", port: "", protocol: "https:", origin: "https://localhost", search: "" },
    sessionStorage: memory(),
    localStorage: memory(),
    addEventListener: () => {},
    navigator: { onLine: true },
  };
  window.window = window;
  window.top = window;
  runInNewContext(src, {
    ...window,
    window,
    document: {
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
    },
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  });
  return window.LostApi as LostApi;
}

const api = loadLostApi();

describe("물건 이름 → 종류 미리 고르기", () => {
  it.each([
    ["카드지갑", "WALLET", "CARD_WALLET"],
    ["검정 카드 지갑", "WALLET", "CARD_WALLET"],
    ["카드케이스", "WALLET", "CARD_WALLET"],
    ["학생증 지갑", "WALLET", "CARD_WALLET"],
    ["반지갑", "WALLET", "BIFOLD_WALLET"],
    ["장지갑", "WALLET", "LONG_WALLET"],
    ["펜던트 목걸이", "ACCESSORY", "JEWELRY"],
  ])("%s → %s/%s (긴 합성어가 먼저)", (text, category, sub) => {
    expect(api.guessCategory(text)).toBe(category);
    expect(api.guessSubCategory(category, text)).toBe(sub);
  });

  it.each([
    ["학생증", "ID_CARD"],
    ["교통카드", "TRANSIT_CARD"],
    ["카드", "OTHER_CARD"],
    ["반지", "ACCESSORY"],
    ["볼펜", "STATIONERY"],
    ["에어팟", "EARPHONE"],
    ["아이라이너", "ETC"],
  ])("기존 낱말은 그대로: %s → %s", (text, category) => {
    expect(api.guessCategory(text)).toBe(category);
  });
});
