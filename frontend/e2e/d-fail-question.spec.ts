// e2e (d) 실패·질문·대면 확인 (B5·#29).
// - 맞지 않는 설명 → L-08 실패: 남은 기회만, 저장된 특징은 화면 어디에도 없음. 설명 그대로 다시 → 이전 결과 알림, 횟수 그대로
// - 애매한 설명 → L-08 질문 → L-09 답 한 번 → 통과. 같은 질문에 다시 답하면 409 ALREADY_ANSWERED
// - 확인 도중 물건이 대면 확인으로 넘어감(claim_locked_at) → 409 IN_PERSON_REQUIRED → 대면 확인 화면
import { expect, type Page, test } from "@playwright/test";
import { candidateCards, reportEarphone, SCORE_LIKE, SHOTS, STORED_ONLY, startDemo, withE2eDb } from "./helpers";

const bodyHtml = (page: Page) =>
  page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll("[data-sonner-toaster]")) el.remove();
    return clone.outerHTML;
  });

const claimResponse = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "POST" && /\/lost-reports\/[^/]+\/claims$/.test(r.url()));

test("맞지 않는 설명: 실패 화면에 힌트 없음, 설명 그대로 다시 누르면 횟수 그대로", async ({ page }) => {
  await startDemo(page);
  await reportEarphone(page, "빨간 이어폰, 고양이 키링");
  const card = candidateCards(page).first();
  await expect(card.getByText("3번 중 3번")).toBeVisible();

  const first = claimResponse(page);
  await card.getByRole("button", { name: "내 물건인지 확인" }).click();
  const body = await (await first).json();
  expect(body).toMatchObject({ result: "FAIL", reused: false, attemptsLeft: 2 });
  expect(Object.keys(body).sort()).toEqual(["attemptId", "attemptsLeft", "inPersonOnly", "result", "reused"]);

  await expect(page.getByText("설명과 일치하지 않아요")).toBeVisible();
  await expect(page.getByText("3번 중 2번")).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(STORED_ONLY);
  expect(text).not.toMatch(/흰|맞은 항목|틀린|색이|브랜드/);
  expect(text).not.toMatch(SCORE_LIKE);
  expect(await bodyHtml(page)).not.toMatch(STORED_ONLY);
  await page.screenshot({ path: `${SHOTS}/d-01-fail.png` });

  // 설명을 안 고치고 다시 → 이전 결과, 횟수 그대로
  await page.getByRole("button", { name: "후보 목록으로" }).click();
  await expect(candidateCards(page).first().getByText("3번 중 2번")).toBeVisible();
  const again = claimResponse(page);
  await candidateCards(page).first().getByRole("button", { name: "내 물건인지 확인" }).click();
  expect(await (await again).json()).toMatchObject({ result: "FAIL", reused: true, attemptsLeft: 2 });
  await expect(page.getByText("이전 결과예요. 횟수는 그대로예요.")).toBeVisible();
  await expect(page.getByText("3번 중 2번")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/d-02-reused.png` });
  await page.getByRole("button", { name: "후보 목록으로" }).click();
  await expect(candidateCards(page).first().getByText("3번 중 2번")).toBeVisible();
});

test("애매한 설명: 확인 질문에 한 번 답해 통과, 두 번째 답은 서버가 막음", async ({ page }) => {
  await startDemo(page);
  await reportEarphone(page, "검정 이어폰, 곰돌이 스티커");
  await candidateCards(page).first().getByRole("button", { name: "내 물건인지 확인" }).click();
  await expect(page.getByText("한 가지만 더 확인할게요")).toBeVisible();
  await page.getByRole("button", { name: "질문 보기" }).click();

  await expect(page).toHaveURL(/\/claims\/[0-9a-f-]{36}\/question/);
  await expect(page.getByRole("heading", { name: "흠집은 어느 쪽에 있나요?" })).toBeVisible();
  // 질문 화면에도 저장된 값(답)은 없다
  expect(await page.locator("body").innerText()).not.toMatch(/오른쪽 아래|긁힘|흰색|애플|Apple/);
  await page.screenshot({ path: `${SHOTS}/d-03-question.png` });
  await page.getByLabel("답", { exact: true }).fill("오른쪽 아래");
  const answerReq = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/answer"));
  await page.getByRole("button", { name: "답 보내기" }).click();
  await expect(page.getByText("내 물건이 맞아요")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/d-04-question-pass.png` });

  // 두 번째 답: 화면은 다시 보낼 길을 주지 않는다(뒤로 가면 이전 결과 통과, 횟수 그대로).
  // 서버도 막는지 같은 토큰으로 직접 보내 확인한다 → 409 ALREADY_ANSWERED
  const auth = (await answerReq).headers().authorization;
  const replay = await page.request.post((await answerReq).url(), {
    headers: { authorization: auth as string, "content-type": "application/json" },
    data: { answer: "왼쪽 위" },
  });
  expect(replay.status()).toBe(409);
  expect((await replay.json()).error.code).toBe("ALREADY_ANSWERED");
  await page.goBack();
  await expect(page.getByText("내 물건이 맞아요")).toBeVisible();
  await expect(page.getByText("이전 결과예요. 횟수는 그대로예요.")).toBeVisible();
});

test("확인 도중 대면 확인으로 넘어간 물건: 409 IN_PERSON_REQUIRED → 대면 확인 화면", async ({ page }) => {
  await startDemo(page);
  await reportEarphone(page, "흰 이어폰, 곰돌이 스티커");
  const card = candidateCards(page).first();
  await expect(card.getByRole("button", { name: "내 물건인지 확인" })).toBeVisible();

  // 시연 이어폰을 직접 잠근다 (다른 계정 실패가 10회 쌓인 것과 같은 상태)
  const id = await withE2eDb(async (db) => {
    const r = await db.query<{ id: string }>(
      "UPDATE found_item SET claim_locked_at = now() WHERE is_seed AND category = 'EARPHONE' RETURNING id",
    );
    expect(r.rowCount, "잠근 시연 이어폰").toBe(1);
    return r.rows[0]?.id as string;
  });
  try {
    const res = claimResponse(page);
    await card.getByRole("button", { name: "내 물건인지 확인" }).click();
    const r = await res;
    expect(r.status()).toBe(409);
    expect((await r.json()).error.code).toBe("IN_PERSON_REQUIRED");
    await expect(page.getByText("보관처에서 직접 확인해요")).toBeVisible();
    await expect(page.getByText("학생증을 가져가 주세요")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(STORED_ONLY);
    await page.screenshot({ path: `${SHOTS}/d-05-inperson.png` });

    // 후보 목록에서도 대면 확인만, 확인 버튼 없음
    await page.getByRole("button", { name: "후보 목록으로" }).click();
    await expect(card.getByText("대면 확인만")).toBeVisible();
    await expect(card.getByRole("button", { name: "내 물건인지 확인" })).toHaveCount(0);
    await card.getByRole("button", { name: /찾는 방법 보기/ }).click();
    await expect(page.getByText("보관처에서 직접 확인해요")).toBeVisible();
  } finally {
    await withE2eDb((db) => db.query("UPDATE found_item SET claim_locked_at = NULL WHERE id = $1", [id]));
  }
});
