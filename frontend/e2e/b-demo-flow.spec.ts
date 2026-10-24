// e2e (b) 체험: C-01 → C-03 → L-03 → L-04 → L-05 → L-07/L-08 통과 → L-10 → L-11 → L-12(시연).
// 후보 화면에 색·브랜드·특징·점수가 없고, 썸네일이 흑백+블러인지 DOM에서 확인한다 (B4·B5).
import { expect, test } from "@playwright/test";
import {
  candidateCards,
  recordRequests,
  reportEarphone,
  SCORE_LIKE,
  SHOTS,
  STORED_ONLY,
  startDemo,
  urlLeaks,
} from "./helpers";

test("체험 계정으로 신고 → 후보 → 통과 → 사진·위치 → 시연 수령", async ({ page }) => {
  const reqs = recordRequests(page);
  await startDemo(page);
  await expect(page.getByText("체험 모드").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/b-01-home.png` });

  await reportEarphone(page, "흰 이어폰, 곰돌이 스티커");

  // L-05 후보: 최대 3개, 공개 정보만
  const cards = candidateCards(page);
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  const section = page.locator("section", { has: page.getByRole("heading", { name: /비슷한 물건 \d+개/ }) });
  const listText = await section.innerText();
  expect(listText).not.toMatch(STORED_ONLY);
  expect(listText).not.toMatch(/흰|검정|블랙|브랜드/);
  expect(listText).not.toMatch(SCORE_LIKE);
  // 신고 요약(내가 쓴 설명) 밖의 DOM 전체(속성 포함)에도 저장된 특징·색·브랜드가 없다
  const html = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll("[data-sonner-toaster]")) el.remove();
    return clone.outerHTML;
  });
  expect(html.replace(/흰 이어폰, 곰돌이 스티커/g, "")).not.toMatch(STORED_ONLY);
  const thumbs = page.getByTestId("candidate-thumb");
  for (let i = 0; i < (await thumbs.count()); i++) {
    const filter = await thumbs.nth(i).evaluate((el) => getComputedStyle(el).filter);
    expect(filter).toContain("grayscale(1)");
    expect(filter).toMatch(/blur\((1[0-9]|[2-9][0-9])px\)/);
  }
  await page.screenshot({ path: `${SHOTS}/b-02-candidates.png` });

  // L-07 → L-08 통과
  await cards.first().getByRole("button", { name: "내 물건인지 확인" }).click();
  await expect(page.getByText("내 물건이 맞아요")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/b-03-pass.png` });

  // L-10 사진·위치
  await page.getByRole("button", { name: /사진과 위치 보기/ }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  const photo = page.getByRole("img", { name: /무선 이어폰 사진/ });
  await expect(photo).toBeVisible();
  // 잠금 해제 연출(200ms 열림 → 1s 끝) 뒤 블러가 풀린다 (db5fce2 전에는 opening에서 멈췄다)
  await expect.poll(() => photo.evaluate((el) => getComputedStyle(el).filter), { timeout: 5_000 }).toBe("none");
  await expect(photo).toHaveJSProperty("complete", true);
  expect(await photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("유담관 경비실").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/b-04-reveal.png` });

  // L-11 → 체험은 바로 L-12 시연
  await page.getByRole("button", { name: /수령 QR 받기/ }).click();
  await expect(page).toHaveURL(/\/done\?kind=demo$/);
  await expect(page.getByText("시연: 보관처에서 수령 처리됨")).toBeVisible();
  await expect(page.getByText("시연", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/b-05-done.png` });

  expect(urlLeaks(reqs)).toEqual([]);
});
