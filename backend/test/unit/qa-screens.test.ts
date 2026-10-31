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

  it("분실 홈과 등록 완료에 캠퍼스 지도가 있다", () => {
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
    expect(html.indexOf('id="why"')).toBeLessThan(html.indexOf("쓰는 순서"));
    expect(html).not.toContain("오늘 00:00부터");
  });

  it("첫 화면: 10/27 디자인(부제목, 양옆에서 밀고 들어오는 버튼), 체험 배지 없음, 가로 넘침은 잘라 둔다 (10/31 되돌림)", () => {
    const html = read("frontend/index.html");
    expect(html).toContain("분실물을 찍어 올려 찾아주세요");
    expect(html).not.toContain("심사위원 체험 2분");
    expect(html).toMatch(/translateX\(-?115%\)/);
    expect(html).toContain("overflow-x: clip");
  });

  it("관리자 로그인에는 시연 안내가 없다 (10/31 시연 모드 끔)", () => {
    const html = read("frontend/admin/login.html");
    expect(html).not.toContain("서버 없이 예시 데이터로");
    expect(html).not.toContain("시연에서");
  });

  it("체험 수령이 끝나면 수령 전 안내를 숨기고 마무리와 다음 행동을 보여 준다", () => {
    const html = read("frontend/lost/item-handover.html");
    expect(html).toContain('id="pickedUpBox"');
    expect(html).toContain('getElementById("beforePickupNote").hidden = true');
    expect(html).not.toContain('href="../admin/login.html"');
  });

  it("관리자 화면에 '시드'라는 말이 보이지 않는다", () => {
    for (const page of ["frontend/admin/items.html", "frontend/admin/item.html"]) {
      expect(read(page)).not.toContain('text: "시드"');
    }
  });
});

describe("학교 메일 칸 (@skuniv.ac.kr 고정)", () => {
  type SchoolEmailApi = {
    SCHOOL_DOMAIN: string;
    schoolEmailId: (raw: string) => { id: string; error: string };
    isValidSchoolId: (id: string) => boolean;
  };
  const load = (): SchoolEmailApi => {
    const win: { SchoolEmail?: SchoolEmailApi } = {};
    new Function("window", read("frontend/lost/school-email.js"))(win);
    return win.SchoolEmail as SchoolEmailApi;
  };
  const se = load();

  it("아이디만 적으면 그대로 쓴다", () => {
    expect(se.schoolEmailId(" song12 ")).toEqual({ id: "song12", error: "" });
  });

  it("학교 주소를 통째로 붙여 넣으면 아이디만 남긴다", () => {
    expect(se.schoolEmailId("song12@skuniv.ac.kr")).toEqual({ id: "song12", error: "" });
    expect(se.schoolEmailId("Song12@SKUNIV.AC.KR")).toEqual({ id: "Song12", error: "" });
    expect(se.schoolEmailId("song12@sku")).toEqual({ id: "song12", error: "" });
  });

  it("다른 도메인은 안내한다", () => {
    expect(se.schoolEmailId("song12@gmail.com").error).toBe("서경대 메일만 쓸 수 있어요.");
  });

  it("공백·@가 있는 아이디는 받지 않는다", () => {
    expect(se.isValidSchoolId("song12")).toBe(true);
    expect(se.isValidSchoolId("")).toBe(false);
    expect(se.isValidSchoolId("so ng")).toBe(false);
  });

  it("가입·로그인 화면은 아이디 칸과 고정 접미사를 쓴다", () => {
    for (const page of ["frontend/lost/signup.html", "frontend/lost/login.html"]) {
      const html = read(page);
      expect(html).toContain('class="email-suffix"');
      expect(html).toContain("@skuniv.ac.kr</span>");
      expect(html).toContain('src="school-email.js"');
      expect(html).not.toContain('placeholder="아이디@skuniv.ac.kr"');
    }
    expect(read("frontend/lost/signup.html")).toContain("서경대 학생·교직원만 쓸 수 있어요");
  });
});

function lostApiFns(): {
  passExplanation: (claim: unknown, aiRead: unknown, itemId?: string) => string;
} {
  const api = read("frontend/lost/api.js");
  const helpers = api.slice(api.indexOf("const passExplanation"), api.indexOf("/** 화면 이름"));
  const body = `const COLOR_LABELS = { WHITE: "흰색" };
const itemLabel = (category) => ({ EARPHONE: "무선 이어폰", KEY: "열쇠" })[category] || "";
${helpers}
return { passExplanation };`;
  return new Function(body)() as ReturnType<typeof lostApiFns>;
}

describe("AI가 한 일 (교수 평가 10/30: 분실자 화면에 AI가 보이지 않음)", () => {
  it("후보 화면에는 'AI가 한 일' 상자를 두지 않는다 (통과 화면 한 줄만 남긴다)", () => {
    const html = read("frontend/lost/candidates.html");
    expect(html).not.toContain('id="aiReadBox"');
    expect(html).not.toContain("AI가 한 일");
    expect(read("frontend/lost/api.js")).not.toContain("aiReadSummary");
  });

  it("통과 화면은 신고자 표현으로 무엇이 맞았는지 말하고, 다른 물건의 판정이면 아무것도 말하지 않는다", () => {
    const { passExplanation } = lostApiFns();
    const aiRead = {
      category: "KEY",
      subCategory: null,
      color: null,
      brand: null,
      features: [{ key: "keyring", value: "냥이 열쇠고리" }],
    };
    const claim = { result: "PASS", matchedFields: ["feature:keyring"], foundItemId: "a" };
    expect(passExplanation(claim, aiRead, "a")).toContain("냥이 열쇠고리");
    expect(passExplanation(claim, aiRead, "b")).toBe("");
    expect(passExplanation({ result: "PASS", foundItemId: "a" }, aiRead, "a")).toContain("확인 질문");
    expect(passExplanation({ result: "FAIL" }, aiRead, "a")).toBe("");
    for (const page of ["frontend/lost/item.html", "frontend/lost/item-handover.html"]) {
      expect(read(page)).toContain('id="passAiLine"');
    }
  });

  it("신고 건물 목록이 늦게 와도 고른 건물을 지우지 않는다", () => {
    const html = read("frontend/lost/report.html");
    expect(html).toContain("dataset.touched");
    expect(html).not.toContain('<option value="혜인관" selected>');
    expect(html).toMatch(/\/\^\\d\+\$\/\.test\(rawBuilding\)/);
  });

  it("문구가 실제 동작과 맞는다", () => {
    const guide = read("frontend/guide.html");
    expect(guide).toContain("최대 3개");
    expect(guide).toContain("모든 계정을 합쳐 10번");
    expect(guide).toContain("사진 한 장으로 AI가 하는 일");
    expect(read("frontend/lost/candidates.html")).not.toContain("곰돌이 스티커");
    expect(read("frontend/lost/api.js")).toContain('RELATED_CATEGORY: "연관 종류"');
  });
});

describe("귀중품은 막지 않고 보관처를 추천한다 (10/30 정책 변경, QA B11)", () => {
  const register = read("frontend/found/register.html");

  it("그 자리에 둠을 숨기지 않고, 누르면 앱 안 추천 창을 띄운다", () => {
    expect(register).not.toContain("lockToHandover");
    expect(register).not.toContain("VALUABLE_HAND_OVER_REQUIRED");
    expect(register).toContain('id="valuableModal"');
    expect(register).toContain("귀중품이라 보관처에 맡기는 걸 추천드려요!");
    expect(register).toContain("그대로 둘게요");
    expect(register).toContain("보관처에 맡길게요");
  });

  it("가장 가까운 보관처를 거리로 고르고, 완료 화면도 한 번 더 권한다", () => {
    expect(register).toContain("function nearestPlace");
    expect(register).toContain("FoundApi.distanceM");
    expect(read("frontend/found/api.js")).toMatch(/nearestTo,\s+distanceM,/);
    expect(read("frontend/found/done-inplace.html")).toContain("가능하면 보관처");
  });

  it("받침에 맞춰 이/가를 붙인다", () => {
    const start = register.indexOf("const subjectJosa");
    const body = register.slice(start, register.indexOf("};", start) + 2);
    const josa = new Function(`${body}; return subjectJosa;`)() as (w: string) => string;
    expect(josa("교무처")).toBe("가");
    expect(josa("학술정보관")).toBe("이");
  });
});

describe("습득 등록: 물건 설명(선택)", () => {
  const register = read("frontend/found/register.html");

  it("펼쳐진 한 줄 선택 칸이고 200자 제한, 개인정보 주의 문구, 상황 예시가 있다 (QA 10/31)", () => {
    expect(register).toContain('<div class="note-box" id="noteBox">');
    expect(register).not.toContain('<details class="note-box"');
    expect(register).toContain("특징이나 주웠을 때 상황");
    expect(register).toMatch(/id="finderNote"[^>]*maxlength="200"/);
    expect(register).toContain("이름·학번·전화번호는 적지 마세요");
  });

  it("사진 분석이 실패하면 펼쳐서 글로 분류한다고 알리고, 설명은 note로 보낸다", () => {
    expect(register).toContain("finderNote.rows = 2");
    expect(register).toContain("AI가 글로 분류해요");
    expect(register).toContain("{ note: finderNote.value.trim().slice(0, 200) }");
  });

  it("관리자 물건 상세에 습득자 설명을 보여 준다", () => {
    expect(read("frontend/admin/item.html")).toContain('$("kvNote").textContent = item.finderNote');
  });
});

describe("내 분실 신고 지우기", () => {
  it("카드 오른쪽 위 휴지통을 누르면 확인 카드를 띄우고, 지우면 DELETE를 부른다", () => {
    const home = read("frontend/lost/home.html");
    expect(home).toContain('btn.className = "card-trash"');
    expect(home).toContain('btn.setAttribute("aria-label", "신고 지우기")');
    expect(home).toContain('id="deleteModal"');
    expect(home).toContain("이 분실 신고를 지울까요?");
    expect(home).toContain("LostApi.deleteReport(");
    const api = read("frontend/lost/api.js");
    expect(api).toContain("deleteReport: (reportId) => call(`/lost-reports/");
    expect(api).toContain('{ method: "DELETE" }');
    // 휴지통은 카드 링크(<a>) 안에 넣지 않는다 (링크 안 버튼은 눌러도 링크로 넘어간다)
    expect(read("frontend/palette.css")).toContain(".card-trash");
  });
});

describe("실서비스 평가 10/30 오후 (체험 진입·문구·시연 데이터)", () => {
  it("캡차가 막히면 '알 수 없는 문제' 대신 이유와 '다시 확인'을 보여 준다", () => {
    const cap = read("frontend/found/captcha.js");
    expect(cap).toContain("보안 확인을 마치지 못했어요");
    expect(cap).toContain("광고 차단·VPN");
    expect(cap).toContain("다시 확인");
    expect(cap).toContain("window.FoundCaptcha = { mount, helpMessage, showHelp, HELP }");
    expect(read("frontend/lost/api.js")).toContain("window.FoundCaptcha?.helpMessage(err)");
    for (const page of ["frontend/lost/consent-social.html", "frontend/lost/signup.html", "frontend/lost/code.html"]) {
      const html = read(page);
      expect(html).toContain("function showCaptchaHelp");
      expect(html).not.toContain('code: "CAPTCHA_FAILED", message: "사람인지 확인하지 못했어요');
    }
    expect(read("frontend/found/photo.html")).toContain("showCaptchaRetry");
  });

  it("확인 질문 화면에 예시 질문과 '세 문제'가 박혀 있지 않다", () => {
    const html = read("frontend/lost/question.html");
    expect(html).not.toContain("케이스에 스티커가 있나요?");
    expect(html).not.toContain("세 문제");
    expect(html).not.toContain(">질문 1 / 3<");
  });

  it("사진 없이 등록 화면에 들어오면 alert 없이 사진 화면으로", () => {
    const html = read("frontend/found/register.html");
    expect(html).not.toContain(".catch((err) => alert(err.message));");
    expect(html).toContain('"photo.html?need=photo"');
    expect(read("frontend/found/photo.html")).toContain("사진을 먼저 올려 주세요.");
  });

  it("관리자 시연 반지갑: 수령 QR이 있으니 교무처 보관, 열람한 계정은 2개", () => {
    const js = read("frontend/admin/admin.js");
    const item = js.slice(js.indexOf('id: "fi-revealed"'), js.indexOf('id: "fi-claimed"'));
    expect(item).toContain('storageType: "HANDED_OVER"');
    expect(item).toContain("ab***@example.invalid");
    expect(item.match(/revealedAt/g)?.length).toBe(2);
  });

  it("통계 화면: 미래 날짜를 못 고르고, 잘못 고르면 옛 결과를 지운다", () => {
    const html = read("frontend/admin/stats.html");
    expect(html).toContain(".max = AdminApi.seoulDate(0)");
    expect(html).toContain('clearResults("기간을 다시 골라 주세요.")');
    expect(html).toContain("clampedToToday");
  });
});

describe("QA 10/31: 화면 문구·기본값", () => {
  it("체험 안내가 탐지·예측·해결 관점으로 설명하고, 습득자가 가입하지 않는 이유를 말한다", () => {
    const guide = read("frontend/guide.html");
    expect(guide).toContain("<b>탐지</b>");
    expect(guide).toContain("<b>예측</b>");
    expect(guide).toContain("<b>해결</b>");
    expect(guide).not.toContain("<b>구간을 미리 알려요</b>");
    expect(guide).toContain("주운 사람은 가입하지 않아요");
  });

  it("습득 동의 화면에 가입을 받지 않는 이유가 한 줄 있다", () => {
    expect(read("frontend/found/consent.html")).toContain("주운 분의 시간을 아끼려고 가입을 받지 않아요");
  });

  it("분실 신고의 건물 기본 목록은 시드 13곳과 같고 시드에 없는 이름이 없다", () => {
    const report = read("frontend/lost/report.html");
    for (const n of [
      "본관",
      "유담관",
      "한림관",
      "북악관",
      "문예관",
      "대일관",
      "상승관",
      "청운관",
      "혜인관",
      "은주관",
      "수인관",
      "생활관",
      "공연실습소",
    ])
      expect(report).toContain(`<option value="${n}">${n}</option>`);
    expect(report).not.toContain("중앙도서관");
    expect(report).not.toContain('<option value="학생회관">');
  });

  it("관리자 홈 알림 카드가 지금 알림 종류를 설명한다", () => {
    const home = read("frontend/admin/home.html");
    expect(home).toContain("그 자리 귀중품");
    expect(home).toContain("맡길 물건·수령 예정");
  });

  it("관리자 홈 맨 위에서 수령 QR 스캔으로 갈 수 있다", () => {
    const home = read("frontend/admin/home.html");
    expect(home).toContain('<a class="choice" id="linkScan" href="scan.html">');
    expect(home.indexOf('id="linkScan"')).toBeLessThan(home.indexOf('id="linkReview"'));
  });

  it("내 신고: QR 받은 신고는 QR 화면을 바로 열고, 수령 완료 카드는 눌러도 반응이 없다", () => {
    const home = read("frontend/lost/home.html");
    expect(home).toContain("item-handover.html?id=");
    expect(home).toContain("encodeURIComponent(p.foundItemId)}&qr=1");
    expect(home).toContain('[[done ? "수령 완료" : "종료", "glow-red"]]');
    expect(home).toContain('card.setAttribute("aria-disabled", "true")');
    expect(read("frontend/palette.css")).toContain(".card.is-inert { cursor: default;");
    expect(read("frontend/lost/item-handover.html")).toContain('get("qr") === "1") qrBtn.click()');
  });

  it("확인 모달과 질문 화면에 3번 틀리면 풀리지 않는 잠금 규칙을 처음부터 알린다", () => {
    for (const f of ["frontend/lost/candidates.html", "frontend/lost/question.html"])
      expect(read(f)).toContain("3번 틀리면 다시 확인할 수 없고(기다려도 풀리지 않아요)");
  });

  it("첫 화면에 지도는 다시 넣지 않는다", () => {
    expect(read("frontend/index.html")).not.toContain("door-map");
  });
});

describe("QA 10/31: 그 자리에 둠은 자세한 위치 필수, 첫 화면 제목 가운데", () => {
  const register = read("frontend/found/register.html");

  it("그 자리에 둠이면 위치 세부 설명이 필수(*)이고 안내·오류 칸이 있다, alert는 쓰지 않는다", () => {
    expect(register).toContain('id="locDetailReq"');
    expect(register).toContain(
      "주인이 바로 찾을 수 있게 어디에 뒀는지 정확히 적어 주세요 (예: 3층 302호 뒤쪽 창가 책상 위)",
    );
    expect(register).toContain('id="locDetailErr" role="alert"');
    expect(register).toMatch(/mode === "inplace" && locationDetail\.value\.trim\(\)\.length < LOC_DETAIL_MIN/);
    expect(register).toContain("locationDetail.focus()");
    expect(register).toContain("const LOC_DETAIL_MIN = 4;");
  });

  it("첫 화면 제목과 부제목은 원래 배치(한 줄, 부제목은 제목 옆)", () => {
    expect(read("frontend/index.html")).toMatch(/\.title \{[^}]*flex-direction: row;/);
  });
});

describe("심사용 계정으로 심사 (10/31, 체험·시연 진입점 제거)", () => {
  it("첫 화면·로그인·관리자 로그인에 체험·시연 진입점이 없다", () => {
    expect(read("frontend/index.html")).not.toContain("guide.html");
    const login = read("frontend/lost/login.html");
    expect(login).not.toContain("체험해 보기");
    expect(login).not.toContain("demo=1");
    const admin = read("frontend/admin/login.html");
    expect(admin).not.toContain("시연으로 둘러보기");
    expect(admin).not.toContain("startDemo");
    expect(read("frontend/lost/item-handover.html")).not.toContain("관리자 화면 시연 보기");
  });

  it("서비스 소개에는 체험 계정·숨은 특징 정답표·계정 정보가 없다", () => {
    const guide = read("frontend/guide.html");
    expect(guide).not.toContain("체험");
    expect(guide).not.toContain("J.H 각인");
    expect(guide).not.toMatch(/judge|비밀번호/);
  });
});
