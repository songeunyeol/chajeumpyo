// e2e (c) 이메일 가입: C-01 → L-01 → L-02(학교 메일 → 코드 → 비밀번호 + 동의) → L-03. 다른 도메인은 막힌다.
// 인증 코드는 MAIL_MODE=console인 e2e API 로그(e2e/.artifacts/api.log)에서 읽는다.
import { expect, test } from "@playwright/test";
import { recordRequests, SHOTS, signupCodeFromLog, urlLeaks } from "./helpers";

const API_LOG = "e2e/.artifacts/api.log";

test("학교 메일로 가입하면 로그인된 홈으로, 다른 도메인은 안내", async ({ page }) => {
  const reqs = recordRequests(page);
  await page.goto("/");
  await page.getByRole("link", { name: /잃어버렸어요/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("link", { name: "회원가입" }).click();
  await expect(page).toHaveURL(/\/signup$/);

  // 다른 도메인: 안내가 뜨고 코드 요청은 나가지 않는다
  const email = page.getByLabel("학교 이메일");
  await email.fill("someone@gmail.com");
  await page.getByRole("checkbox", { name: /사람인지 확인해 주세요/ }).click();
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByText("학교 이메일(@skuniv.ac.kr)만 쓸 수 있어요.")).toBeVisible();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  expect(reqs.filter((r) => r.url().includes("/auth/email"))).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/c-01-wrong-domain.png` });

  // 학교 메일 → 코드
  const addr = `e2e${Date.now()}@skuniv.ac.kr`;
  await email.fill(addr);
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByText(`${addr} 로 보냈어요.`)).toBeVisible();
  let code: string | null = null;
  await expect.poll(() => (code = signupCodeFromLog(API_LOG, addr))).toMatch(/^\d{6}$/);
  await page.getByLabel("인증 코드 6자리").fill(code as unknown as string);

  // 비밀번호 + 동의(시트가 자동으로 열림)
  await expect(page.getByRole("dialog", { name: "시작하기 전에 확인해 주세요" })).toBeVisible();
  await page.getByText("모두 동의해요").click();
  await page.getByRole("button", { name: "동의하고 계속하기" }).click();
  await expect(page.getByRole("heading", { name: "비밀번호를 정해 주세요" })).toBeVisible();
  await expect(page.getByText(/필수 2개 동의함/)).toBeVisible();
  await page.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-1234");
  await page.getByLabel("비밀번호 확인").fill("e2e-pass-1234");
  await page.getByRole("button", { name: "가입하기" }).click();

  // L-03: 회원(체험 띠 없음), 새로고침해도 로그인 유지
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "내 분실 신고" })).toBeVisible();
  await expect(page.getByText("체험 모드")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "내 분실 신고" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/c-02-home.png` });

  expect(urlLeaks(reqs)).toEqual([]);
});
