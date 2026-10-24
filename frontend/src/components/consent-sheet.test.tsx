import { CONSENT_VERSION } from "@chajeumpyo/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { loadConsent } from "@/lib/consent-store";
import { ConsentSheet } from "./consent-sheet";

describe("C-02 동의 시트", () => {
  it("습득자: 이메일 항목이 없고, 필수(AI)를 체크해야 버튼이 켜진다", async () => {
    const onAgree = vi.fn();
    render(<ConsentSheet flow="finder" open onOpenChange={() => {}} onAgree={onAgree} />);
    expect(screen.queryByText(/학교 이메일 수집/)).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "동의하고 계속하기" });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/필수 항목에 동의해야 이용할 수 있어요/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("사진·설명 외부 AI 처리"));
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onAgree).toHaveBeenCalledWith(
      expect.objectContaining({ version: CONSENT_VERSION, externalAi: true, location: false, email: false }),
    );
    expect(loadConsent("finder")?.externalAi).toBe(true);
  });

  it("동의 버전(CONSENT_VERSION)을 보여 준다", () => {
    render(<ConsentSheet flow="finder" open onOpenChange={() => {}} onAgree={() => {}} />);
    expect(screen.getByText(new RegExp(`동의 버전 ${CONSENT_VERSION}`))).toBeInTheDocument();
  });

  it("회원가입: 이메일·AI 둘 다 필수, 모두 동의하면 위치(선택)까지 체크", async () => {
    const onAgree = vi.fn();
    render(<ConsentSheet flow="member" open onOpenChange={() => {}} onAgree={onAgree} />);
    const btn = screen.getByRole("button", { name: "동의하고 계속하기" });
    await userEvent.click(screen.getByText("사진·설명 외부 AI 처리"));
    expect(btn).toBeDisabled();
    expect(screen.getByText(/가입할 수 있어요/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("모두 동의해요"));
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onAgree).toHaveBeenCalledWith(expect.objectContaining({ email: true, externalAi: true, location: true }));
  });

  it("버전이 바뀐 옛 동의는 다시 묻는다", () => {
    localStorage.setItem(
      "chajeumpyo.consent.finder",
      JSON.stringify({ version: "2000-01-01", email: false, externalAi: true, location: true }),
    );
    expect(loadConsent("finder")).toBeNull();
  });
});
