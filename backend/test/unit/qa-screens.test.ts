import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function adjustLostWindow(): (from: number, to: number, now: number) => { from: number; to: number } {
  const api = read("frontend/lost/api.js");
  const start = api.indexOf("function adjustLostWindow");
  const end = api.indexOf("function lostRange");
  const body = api.slice(start, end);
  return new Function(`${body}; return adjustLostWindow;`)() as (
    from: number,
    to: number,
    now: number,
  ) => { from: number; to: number };
}

describe("분실 시간대", () => {
  const adjust = adjustLostWindow();
  const at = (iso: string) => Date.parse(iso);

  it("자정에 고른 오늘 13:00~15:00은 어제 같은 시각으로 남는다", () => {
    const got = adjust(
      at("2026-10-30T13:00:00+09:00"),
      at("2026-10-30T15:00:00+09:00"),
      at("2026-10-30T00:09:00+09:00"),
    );
    expect(got.from).toBe(at("2026-10-29T13:00:00+09:00"));
    expect(got.to).toBe(at("2026-10-29T15:00:00+09:00"));
  });

  it("끝만 미래면 끝만 지금으로 줄인다", () => {
    const now = at("2026-10-30T14:00:00+09:00");
    const got = adjust(at("2026-10-30T13:00:00+09:00"), at("2026-10-30T15:00:00+09:00"), now);
    expect(got.from).toBe(at("2026-10-30T13:00:00+09:00"));
    expect(got.to).toBe(now);
  });

  it("이미 지난 구간은 그대로 둔다", () => {
    const from = at("2026-10-30T13:00:00+09:00");
    const to = at("2026-10-30T15:00:00+09:00");
    const got = adjust(from, to, at("2026-10-30T16:00:00+09:00"));
    expect(got.from).toBe(from);
    expect(got.to).toBe(to);
  });
});

describe("QA 화면", () => {
  it("확인 전 내 물건 화면은 통과라고 적지 않는다", () => {
    const item = read("frontend/lost/item.html");
    expect(item).toContain('id="passIntro" hidden');
    expect(item).toContain('id="passToItemViewport" hidden');
    expect(item).not.toContain("무선 이어폰");
    expect(item).toContain('id="passBadge"></span>');
    expect(item).toContain('passBadge").textContent = "✓ 확인 통과"');
    const handover = read("frontend/lost/item-handover.html");
    expect(handover).toContain('id="passIntro" hidden');
    expect(handover).toContain("교무처에서 QR을 보여 주면 수령이 완료되고 신고가 끝나요");
  });

  it("알림 제목은 한 번만 있다", () => {
    const alerts = read("frontend/lost/alerts.html");
    expect(alerts.match(/<h1>알림<\/h1>/g)).toBeNull();
    expect(alerts.match(/<h2>알림<\/h2>/g)).toHaveLength(1);
  });

  it("나가기 창은 해요체이고, 숨겨 두었다가 연다", () => {
    expect(read("frontend/lost/report.html")).toContain("분실 신고를 그만할까요?");
    expect(read("frontend/found/register.html")).toContain("습득물 등록을 그만할까요?");
    expect(read("frontend/leave-guard.js")).toContain("backdrop.hidden = true");
    expect(read("frontend/leave-guard.js")).not.toContain("습니까");
  });

  it("위치를 못 받으면 안내 문구가 있다", () => {
    const register = read("frontend/found/register.html");
    expect(register).toContain("위치를 받지 못했어요. 목록에서 건물을 골라 주세요.");
    expect(register).toContain('id="locStatus"');
  });

  it("홈과 등록 완료에 캠퍼스 지도가 있다", () => {
    expect(read("frontend/index.html")).toContain('id="homeMap"');
    expect(read("frontend/lost/home.html")).toContain('id="homeMap"');
    expect(read("frontend/found/done-handover.html")).toContain('id="doneMapBox"');
    expect(read("frontend/found/register.html")).toContain('id="registerMap"');
    expect(read("frontend/naver-map.js")).toContain("/campus-map.png");
    expect(read("frontend/sw.js")).toContain('VERSION = "v22"');
  });
});
