import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { DemoStartPage } from "./demo-start";

describe("C-03 체험 시작", () => {
  it("AI 처리 동의와 캡차가 있어야 시작할 수 있다", async () => {
    renderWithProviders(<DemoStartPage />);
    const start = screen.getByRole("button", { name: "체험 시작하기" });
    expect(start).toBeDisabled();
    await userEvent.click(screen.getByText("사진 외부 AI 처리에 동의해요"));
    expect(start).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /사람인지/ }));
    expect(start).toBeEnabled();
  });

  it("캡차 실패면 알림을 보여 주고 캡차를 다시 확인하게 한다", async () => {
    localStorage.setItem("chajeumpyo.mock.fail.demo", "CAPTCHA_FAILED");
    renderWithProviders(<DemoStartPage />);
    await userEvent.click(screen.getByText("사진 외부 AI 처리에 동의해요"));
    await userEvent.click(screen.getByRole("checkbox", { name: /사람인지/ }));
    await userEvent.click(screen.getByRole("button", { name: "체험 시작하기" }));
    expect(await screen.findByText("사람 확인에 실패했어요")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /사람인지/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "체험 시작하기" })).toBeDisabled();
  });

  it("요청 제한(429)이면 잠시 후 안내", async () => {
    localStorage.setItem("chajeumpyo.mock.fail.demo", "RATE_LIMITED");
    renderWithProviders(<DemoStartPage />);
    await userEvent.click(screen.getByText("사진 외부 AI 처리에 동의해요"));
    await userEvent.click(screen.getByRole("checkbox", { name: /사람인지/ }));
    await userEvent.click(screen.getByRole("button", { name: "체험 시작하기" }));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
  });
});
