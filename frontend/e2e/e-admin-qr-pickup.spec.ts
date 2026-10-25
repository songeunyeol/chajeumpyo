// e2e (e) 관리자 QR 수령 (F-11·F-14):
// 회원 신고 → 확인 통과(보관처에 맡긴 일반 습득물) → L-10 → L-11 "코드 보기"로 토큰 읽기
// → 다른 브라우저 컨텍스트의 관리자: A-01 로그인 → A-03 목록(사진은 모두 공개본, 원본 없음) → A-04 속성 고치고 저장
// → A-05 직접 입력: 만료(410)·다른 보관처(403) 안내 → 확인 화면(가린 이메일·물건·원본 사진) → 수령 완료
// → 학생 화면은 "이미 수령된 물건이에요"·"찾음", 같은 코드 다시 → 409 "이미 수령된 물건이에요"
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  CENTER_ADMIN,
  candidateCards,
  enterPickupCode,
  GUARD_ADMIN,
  loginAdmin,
  loginMember,
  recordRequests,
  reportEarphone,
  SHOTS,
  signupMemberViaApi,
  urlLeaks,
  withE2eDb,
} from "./helpers";

const maskEmail = (email: string) => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(4, local.length - 2))}@${domain}`;
};

/** 관리자는 학생과 다른 브라우저 컨텍스트(저장소·쿠키 따로) */
async function adminPage(browser: Browser, baseURL: string | undefined, email: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: 412, height: 915 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await ctx.newPage();
  await loginAdmin(page, email);
  return page;
}

const scanResponse = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/admin/pickups/scan"));

test("회원 QR 수령: L-11 코드 → 관리자 목록·상세·직접 입력 → 수령 완료, 두 번째는 409", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const reqs = recordRequests(page);
  const member = await signupMemberViaApi(request);

  // 학생: 신고 → 통과 → L-10 → L-11
  await loginMember(page, member.email, member.password);
  // 후보 중 유담관 경비실(관리자 guard)에 맡긴 일반 습득물을 고른다. (a)가 먼저 돌면 이어폰이 더 있어 순서가 바뀐다
  const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/lost-reports"));
  await reportEarphone(page, "흰색 이어폰, 곰돌이 스티커");
  const { candidates } = (await (await created).json()) as { candidates: { foundItemId: string }[] };
  const atGuard = await withE2eDb(async (db) => {
    const r = await db.query<{ id: string }>(
      `SELECT f.id FROM found_item f JOIN storage_place p ON p.id = f.storage_place_id
       WHERE NOT f.is_seed AND f.storage_type = 'HANDED_OVER' AND p.name = '유담관 경비실'`,
    );
    return new Set(r.rows.map((x) => x.id));
  });
  const idx = candidates.findIndex((c) => atGuard.has(c.foundItemId));
  expect(idx, "유담관 경비실 후보").toBeGreaterThanOrEqual(0);
  await expect(candidateCards(page)).toHaveCount(candidates.length);
  await candidateCards(page).nth(idx).getByRole("button", { name: "내 물건인지 확인" }).click();
  await expect(page.getByText("내 물건이 맞아요")).toBeVisible();
  await page.getByRole("button", { name: /사진과 위치 보기/ }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  const itemId = new URL(page.url()).pathname.split("/").pop() as string;
  const item = await withE2eDb(async (db) => {
    const r = await db.query<{ is_seed: boolean; storage_type: string; place: string }>(
      `SELECT f.is_seed, f.storage_type, p.name AS place FROM found_item f
       JOIN storage_place p ON p.id = f.storage_place_id WHERE f.id = $1`,
      [itemId],
    );
    return r.rows[0];
  });
  expect(item, "보관처에 맡긴 일반 습득물").toEqual({
    is_seed: false,
    storage_type: "HANDED_OVER",
    place: "유담관 경비실",
  });
  await page.getByRole("button", { name: /수령 QR 받기/ }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}/qr$`));
  await expect(page.getByRole("img", { name: "수령 QR 코드" })).toBeVisible();
  await page.getByRole("button", { name: "코드 보기" }).click();
  const grouped = (await page.getByTestId("qr-code-text").innerText()).trim();
  expect(grouped).toMatch(/^(\S{4} )+\S{1,4}$/);
  const token = grouped.replace(/\s+/g, "");
  expect(token.length).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: `${SHOTS}/e-01-l11-code.png` });

  // 관리자(유담관 경비실): A-01 → A-03
  const guard = await adminPage(browser, baseURL, GUARD_ADMIN);
  const adminReqs = recordRequests(guard);
  await guard.goto("/admin/items");
  const row = guard.locator(`a[href="/admin/items/${itemId}"]`).first();
  await expect(row).toBeVisible();
  const imgs = guard.locator("img");
  await expect(guard.getByTestId("list-thumb").first()).toBeVisible();
  const srcs = await imgs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  expect(srcs.length).toBeGreaterThan(0);
  for (const src of srcs) {
    expect(src, "목록 사진은 공개본만").toMatch(/\/files\/found\/[0-9a-f-]{36}\/public\.jpg\?exp=\d+&sig=/);
    expect(src).not.toMatch(/original|thumb\.jpg/);
  }
  // 목록 사진이 실제로 뜬다
  const firstThumb = guard.getByTestId("list-thumb").first();
  await expect.poll(() => firstThumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await guard.screenshot({ path: `${SHOTS}/e-02-a03-list.png` });

  // A-04 속성 고치고 저장
  await row.click();
  await expect(guard).toHaveURL(new RegExp(`/admin/items/${itemId}$`));
  await guard.getByRole("button", { name: "속성 고치기" }).click();
  const title = "흰색 무선 이어폰 (e2e 수정)";
  await guard.locator("#attr-title").fill(title);
  const patch = guard.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(itemId));
  await guard.getByRole("button", { name: "저장", exact: true }).click();
  expect((await patch).status()).toBe(200);
  await expect(guard.getByText("저장했어요.")).toBeVisible();
  await expect(guard.getByText(title, { exact: true }).locator("visible=true").first()).toBeVisible();
  await guard.screenshot({ path: `${SHOTS}/e-03-a04-saved.png` });
  const saved = await withE2eDb(
    async (db) =>
      (await db.query<{ title: string }>("SELECT title FROM found_item_detail WHERE found_item_id = $1", [itemId]))
        .rows[0],
  );
  expect(saved?.title).toBe(title);

  // A-05 만료된 QR → 410 안내 (발급 건의 만료 시각을 잠시 과거로)
  const prevExpiry = await withE2eDb(async (db) => {
    const r = await db.query<{ qr_expires_at: Date }>(
      "SELECT qr_expires_at FROM pickup WHERE found_item_id = $1 AND status = 'ISSUED'",
      [itemId],
    );
    expect(r.rowCount, "발급된 QR 1건").toBe(1);
    await db.query(
      "UPDATE pickup SET qr_expires_at = now() - interval '1 minute' WHERE found_item_id = $1 AND status = 'ISSUED'",
      [itemId],
    );
    return r.rows[0]?.qr_expires_at as Date;
  });
  try {
    await guard.goto("/admin/scan");
    const expired = scanResponse(guard);
    await enterPickupCode(guard, grouped); // 직원이 띄어 쓴 그대로 넣어도 된다
    expect((await expired).status()).toBe(410);
    await expect(guard.getByTestId("scan-error-QR_EXPIRED")).toBeVisible();
    await expect(guard.getByText("QR이 만료됐어요")).toBeVisible();
    await guard.screenshot({ path: `${SHOTS}/e-04-a05-expired.png` });
  } finally {
    await withE2eDb((db) =>
      db.query("UPDATE pickup SET qr_expires_at = $2 WHERE found_item_id = $1 AND status = 'ISSUED'", [
        itemId,
        prevExpiry,
      ]),
    );
  }

  // 다른 보관처 관리자(종합서비스센터) → 403 안내
  const center = await adminPage(browser, baseURL, CENTER_ADMIN);
  await center.goto("/admin/scan");
  const other = scanResponse(center);
  await enterPickupCode(center, token);
  expect((await other).status()).toBe(403);
  await expect(center.getByTestId("scan-error-FORBIDDEN")).toBeVisible();
  await expect(center.getByText("다른 보관처의 물건이에요")).toBeVisible();
  await center.screenshot({ path: `${SHOTS}/e-05-a05-other-place.png` });
  await center.context().close();

  // 다시 스캔 → 확인 화면 → 수령 완료
  await guard.getByRole("button", { name: "다시 스캔" }).click();
  const ok = scanResponse(guard);
  await enterPickupCode(guard, token);
  expect((await ok).status()).toBe(200);
  const masked = maskEmail(member.email);
  await expect(guard.getByText(masked).first()).toBeVisible();
  expect(await guard.locator("body").innerText()).not.toContain(member.email);
  await expect(guard.getByText("무선 이어폰").first()).toBeVisible();
  const original = guard.getByRole("img", { name: "원본 사진" });
  await expect(original).toBeVisible();
  await expect.poll(() => original.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await guard.screenshot({ path: `${SHOTS}/e-06-a05-confirm.png` });
  const done = guard.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/complete"));
  await guard.getByRole("button", { name: "수령 완료", exact: true }).click();
  expect((await done).status()).toBe(200);
  await expect(guard.getByText("수령 처리했어요")).toBeVisible();
  await guard.screenshot({ path: `${SHOTS}/e-07-a05-done.png` });

  // 같은 코드 다시 → 409
  await guard.getByRole("button", { name: "다음 QR 스캔" }).click();
  const twice = scanResponse(guard);
  await enterPickupCode(guard, token);
  const r2 = await twice;
  expect(r2.status()).toBe(409);
  expect((await r2.json()).error.code).toBe("ALREADY_CLAIMED");
  await expect(guard.getByTestId("scan-error-ALREADY_CLAIMED")).toBeVisible();
  await expect(guard.getByText("이미 수령된 물건이에요")).toBeVisible();
  await guard.screenshot({ path: `${SHOTS}/e-08-a05-twice.png` });
  expect(urlLeaks(adminReqs)).toEqual([]);
  await guard.context().close();

  // DB: 물건 CLAIMED, 신고 RESOLVED, 처리 관리자 기록
  const after = await withE2eDb(async (db) => {
    const r = await db.query<{ item: string; method: string; status: string; admin: string }>(
      `SELECT f.status AS item, p.method, p.status, u.email AS admin FROM found_item f
       JOIN pickup p ON p.found_item_id = f.id AND p.status = 'COMPLETED'
       JOIN "user" u ON u.id = p.processed_by_admin_id WHERE f.id = $1`,
      [itemId],
    );
    return r.rows;
  });
  expect(after).toEqual([{ item: "CLAIMED", method: "CENTER_QR", status: "COMPLETED", admin: GUARD_ADMIN }]);

  // 학생 화면: 수령된 물건, 신고는 "찾음"
  // 수령 뒤에는 사진·비공개 정보를 지우므로(#33) 상세 대신 409 ALREADY_CLAIMED 안내
  const detail = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().endsWith(`/found-items/${itemId}/detail`),
  );
  await page.goto(`/items/${itemId}`);
  const d = await detail;
  expect(d.status()).toBe(409);
  expect((await d.json()).error.code).toBe("ALREADY_CLAIMED");
  await expect(page.getByRole("heading", { name: "이미 주인이 찾아간 물건이에요" })).toBeVisible();
  await expect(page.getByRole("button", { name: /수령 QR 받기/ })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/e-09-student-claimed.png` });
  await page.goto("/home");
  await expect(page.getByText("찾음", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/e-10-student-home.png` });
  expect(urlLeaks(reqs)).toEqual([]);
});
