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
    // 캠퍼스 지도가 SHELL 캐시에 있다 (버전 숫자는 배포마다 바뀌니 고정하지 않는다)
    expect(read("frontend/sw.js")).toContain('"/campus-map.png"');
  });

  it("is-open으로 여닫는 확인 창은 기본이 투명하고 눌리지 않는다 (#96 회귀: 후보 화면이 막혔다)", () => {
    const css = read("frontend/palette.css");
    const base = css.match(/\.modal-backdrop \{[^}]*\}/)?.[0] ?? "";
    expect(base).toContain("opacity: 0");
    expect(base).toContain("pointer-events: none");
    expect(css).toMatch(/\.modal-backdrop\.is-open \{[^}]*pointer-events: auto/);
  });

  it("확인 전에는 통과 화면을 숨긴다 (display: flex가 hidden을 덮지 않게)", () => {
    expect(read("frontend/palette.css")).toContain(
      ".pass-to-item-viewport[hidden], .pass-intro[hidden] { display: none; }",
    );
    expect(read("frontend/lost/item-handover.html")).not.toContain("✓ 확인 통과</span>");
  });
});

describe("QA 10/30 습득 흐름", () => {
  it("동의 화면은 끝난 등록을 지우고 새로 시작한다", () => {
    const consent = read("frontend/found/consent.html");
    expect(consent).toContain("<h1>두 가지를 확인해요</h1>");
    expect(consent).toContain('sessionStorage.getItem("foundConfirmedId")');
    expect(consent).toContain('"foundDraft", "foundConfirmedId"');
  });

  it("완료 화면은 올린 본인에게 층을 보여 준다", () => {
    expect(read("frontend/found/register.html")).toContain('sessionStorage.setItem("foundFloor"');
    expect(read("frontend/found/done-inplace.html")).toContain('id="doneFloorRow" hidden');
    expect(read("frontend/found/done-handover.html")).toContain('sessionStorage.getItem("foundFloor")');
  });

  it("사용자에게 보이는 동의 제목은 해요체다", () => {
    for (const page of [
      "frontend/found/consent.html",
      "frontend/lost/consent-mail.html",
      "frontend/lost/consent-social.html",
    ]) {
      expect(read(page)).not.toContain("확인합니다");
    }
  });
});

describe("우리 QA 10/30 체험 흐름", () => {
  it("분실 시간 기본값은 지금까지 2시간이고, 미래를 고르면 안내한다", () => {
    const html = read("frontend/lost/report.html");
    expect(html).toContain("const defaultStart = (nowHour + 22) % 24;");
    expect(html).toContain("const defaultEnd = nowHour + 1;");
    expect(html).not.toMatch(/h === 13, h === 13/);
    expect(html).toContain('id="timeNote"');
    expect(html).toContain("아직 오지 않은 시간이에요");
  });

  it("기본값(자정 직후 22:00~01:00)은 어제 밤부터 지금까지로 보낸다", () => {
    const adjust = adjustLostWindow();
    const at = (iso: string) => Date.parse(iso);
    const now = at("2026-10-31T00:30:00+09:00");
    const got = adjust(at("2026-10-31T22:00:00+09:00"), at("2026-10-31T01:00:00+09:00"), now);
    expect(got.from).toBe(at("2026-10-30T22:00:00+09:00"));
    expect(got.to).toBe(now);
  });

  it("체험 수령도 QR을 보여 주고 '교무처 스캔 대신하기'로 끝낸다", () => {
    const html = read("frontend/lost/item-handover.html");
    expect(html).toContain('id="demoPickupBtn"');
    expect(html).toContain("LostApi.demoPickup()");
    expect(html).not.toContain("체험 계정이라 바로 수령 완료");
  });

  it("주소의 물건 id가 있으면 그 물건을 연다", () => {
    for (const page of ["frontend/lost/item.html", "frontend/lost/item-handover.html"]) {
      expect(read(page)).toContain('new URLSearchParams(location.search).get("id")');
    }
  });

  it("체험 동의의 AI 항목은 처음엔 꺼져 있는 필수 토글이다", () => {
    const html = read("frontend/lost/consent-social.html");
    expect(html).toMatch(/class="check is-toggle is-off" id="aiConsent"/);
    expect(html).not.toContain("<b>사진 외부 AI</b>");
  });
});

describe("스토리텔링 화면 (QA 10/30 최종)", () => {
  it("체험 안내 맨 위에 '왜 만들었나'가 있고, 00:00부터 안내는 없다", () => {
    const html = read("frontend/guide.html");
    expect(html).toContain('id="why"');
    expect(html).toContain("<b>146건</b>");
    expect(html).toContain("<b>7건</b>");
    expect(html).toContain("<b>9곳 이상</b>");
    expect(html.indexOf('id="why"')).toBeLessThan(html.indexOf("1. 잃어버린 사람으로 체험하기"));
    expect(html).not.toContain("오늘 00:00부터");
  });

  it("첫 화면: 문제 한 줄, 눈에 띄는 체험 안내, 가로로 밀고 들어오는 효과 없음", () => {
    const html = read("frontend/index.html");
    expect(html).toContain("146건");
    expect(html).toContain("심사위원 체험 2분");
    expect(html).not.toMatch(/translateX\(-?115%\)/);
    expect(html).toContain("overflow-x: clip");
  });

  it("관리자 로그인 시연 문구는 서버 집계(#112)와 맞는다", () => {
    const html = read("frontend/admin/login.html");
    expect(html).not.toContain("서버 없이 예시 데이터로");
    expect(html).toContain("서버가 실제 통계 코드로 계산");
  });

  it("체험 수령이 끝나면 수령 전 안내를 숨기고 마무리와 다음 행동을 보여 준다", () => {
    const html = read("frontend/lost/item-handover.html");
    expect(html).toContain('id="pickedUpBox"');
    expect(html).toContain('getElementById("beforePickupNote").hidden = true');
    expect(html).toContain('href="../admin/login.html"');
  });

  it("관리자 화면에 '시드'라는 말이 보이지 않는다", () => {
    for (const page of ["frontend/admin/items.html", "frontend/admin/item.html"]) {
      expect(read(page)).not.toContain('text: "시드"');
    }
  });
});
