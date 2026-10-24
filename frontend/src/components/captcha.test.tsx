import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Captcha, DEV_CAPTCHA_TOKEN, resolveCaptchaMode } from "./captcha";

describe("캡차", () => {
  it("배포 빌드에서 사이트 키가 없으면 설정 오류(개발용 토큰을 보내지 않음)", () => {
    expect(resolveCaptchaMode("", true)).toBe("misconfigured");
    expect(resolveCaptchaMode("", false)).toBe("dev");
    expect(resolveCaptchaMode("0x4AAA", true)).toBe("turnstile");
  });

  it("설정 오류 상태는 안내만 보이고 토큰을 주지 않는다", () => {
    const onToken = vi.fn();
    render(<Captcha onToken={onToken} mode="misconfigured" />);
    expect(screen.getByRole("alert")).toHaveTextContent("사람 확인을 준비하지 못했어요");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(onToken).not.toHaveBeenCalledWith(DEV_CAPTCHA_TOKEN);
  });

  it("개발 모드는 누르면 개발용 토큰", async () => {
    const onToken = vi.fn();
    render(<Captcha onToken={onToken} mode="dev" />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToken).toHaveBeenLastCalledWith(DEV_CAPTCHA_TOKEN);
  });
});
