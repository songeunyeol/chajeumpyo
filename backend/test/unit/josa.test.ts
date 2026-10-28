import { CATEGORY_LABELS } from "@chajeumpyo/shared";
import { describe, expect, it } from "vitest";
import { pickJosa, withJosa } from "../../src/lib/josa";
import { newCandidateMessage } from "../../src/services/notifications";

describe("조사 고르기", () => {
  it("받침이 있으면 이·을·은·과·으로", () => {
    expect(withJosa("가방", "이/가")).toBe("가방이");
    expect(withJosa("가방", "을/를")).toBe("가방을");
    expect(withJosa("가방", "은/는")).toBe("가방은");
    expect(withJosa("가방", "과/와")).toBe("가방과");
    expect(withJosa("가방", "으로/로")).toBe("가방으로");
    expect(withJosa("무선 이어폰", "이/가")).toBe("무선 이어폰이");
    expect(withJosa("노트북", "을/를")).toBe("노트북을");
    expect(withJosa("휴대폰", "으로/로")).toBe("휴대폰으로");
  });

  it("받침이 없으면 가·를·는·와·로", () => {
    expect(withJosa("기타", "이/가")).toBe("기타가");
    expect(withJosa("마우스", "을/를")).toBe("마우스를");
    expect(withJosa("교재·도서", "은/는")).toBe("교재·도서는");
    expect(withJosa("키보드", "과/와")).toBe("키보드와");
    expect(withJosa("학교", "으로/로")).toBe("학교로");
    expect(withJosa("열쇠", "으로/로")).toBe("열쇠로");
  });

  it("ㄹ 받침은 으로가 아니라 로", () => {
    expect(withJosa("연필", "으로/로")).toBe("연필로");
    expect(withJosa("교실", "으로/로")).toBe("교실로");
    expect(withJosa("교실", "이/가")).toBe("교실이");
  });

  it("숫자는 읽는 소리로 (일·삼·육·칠·팔은 받침)", () => {
    expect(withJosa("3", "이/가")).toBe("3이");
    expect(withJosa("2", "이/가")).toBe("2가");
    expect(withJosa("10", "을/를")).toBe("10을");
    expect(withJosa("1", "으로/로")).toBe("1로");
    expect(withJosa("5", "으로/로")).toBe("5로");
    expect(withJosa("6", "으로/로")).toBe("6으로");
  });

  it("끝의 괄호·따옴표·공백은 건너뛴다", () => {
    expect(withJosa("지갑(카드지갑)", "이/가")).toBe("지갑(카드지갑)이");
    expect(withJosa("'우산'", "을/를")).toBe("'우산'을");
  });

  it("영문은 확실한 끝 글자만 정하고, 나머지는 둘 다 적는다", () => {
    expect(pickJosa("Gmail", "이/가")).toBe("이");
    expect(pickJosa("Gmail", "으로/로")).toBe("로");
    expect(pickJosa("Samsung", "을/를")).toBe("을");
    expect(pickJosa("iPad", "이/가")).toBe("이(가)");
    expect(pickJosa("Apple", "을/를")).toBe("을(를)");
    expect(pickJosa("iPad", "으로/로")).toBe("(으)로");
    expect(pickJosa("", "은/는")).toBe("은(는)");
    expect(pickJosa("!!", "을/를")).toBe("을(를)");
  });

  it("모든 종류 이름에 괄호 없이 붙는다", () => {
    for (const label of Object.values(CATEGORY_LABELS)) {
      expect(pickJosa(label, "이/가")).not.toContain("(");
      expect(pickJosa(label, "을/를")).not.toContain("(");
    }
  });

  it("새 후보 알림 문구", () => {
    expect(newCandidateMessage("혜인관", "무선 이어폰")).toBe("혜인관에서 무선 이어폰이 새로 등록됐어요.");
    expect(newCandidateMessage(null, "기타")).toBe("기타가 새로 등록됐어요.");
    expect(newCandidateMessage(null, "지갑")).toBe("지갑이 새로 등록됐어요.");
  });
});
