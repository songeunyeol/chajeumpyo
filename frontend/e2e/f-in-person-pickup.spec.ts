// e2e (f) 대면 확인 후 수령 (#29 후속):
// 확인 실패가 쌓여 잠긴 물건(claim_locked_at, SQL로 설정 — DB 이름 확인 뒤) → A-04에 "대면 확인 후 수령" 블록
// → 메모는 200자에서 막힘(화면 maxLength, 서버도 201자 400) → 빈 메모는 안내 → 메모 적고 완료
// → 물건 CLAIMED, 수령 기록 행에 "대면"·처리 관리자(가림)·메모, 블록은 사라짐
import { expect, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  API_BASE,
  CENTER_ADMIN,
  loginAdmin,
  recordRequests,
  SHOTS,
  urlLeaks,
  withE2eDb,
} from "./helpers";

const NOTE_MAX = 200;

test("잠긴 물건: A-04 대면 확인 메모(200자 제한) → 수령 완료 기록, 블록 사라짐", async ({ page, request }) => {
  // 보관 중인 일반 습득물 하나를 잠근다 (다른 계정 실패 10회가 쌓인 것과 같은 상태). (e)의 이어폰과 겹치지 않게
  const itemId = await withE2eDb(async (db) => {
    const r = await db.query<{ id: string }>(
      `UPDATE found_item SET claim_locked_at = now() WHERE id = (
         SELECT id FROM found_item WHERE NOT is_seed AND storage_type = 'HANDED_OVER'
           AND status IN ('REGISTERED', 'REVEALED') AND category <> 'EARPHONE' AND claim_locked_at IS NULL
         ORDER BY found_at DESC LIMIT 1) RETURNING id`,
    );
    expect(r.rowCount, "잠글 보관 중 습득물").toBe(1);
    return r.rows[0]?.id as string;
  });

  const reqs = recordRequests(page);
  await loginAdmin(page, CENTER_ADMIN);
  await page.goto(`/admin/items/${itemId}`);
  const block = page.getByRole("region", { name: "대면 확인 후 수령" });
  await expect(block).toBeVisible();
  await expect(block.getByText(/신분증 번호 전체는 적지 마세요/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/f-01-block.png`, fullPage: true });

  // 빈 메모 → 안내, 요청 없음
  const memo = block.getByLabel("신분 확인 메모");
  await block.getByRole("button", { name: "대면 확인 후 수령 완료" }).click();
  await expect(block.getByRole("alert")).toHaveText("확인한 내용을 적어 주세요.");
  expect(reqs.filter((r) => r.url().includes("in-person"))).toEqual([]);

  // 너무 긴 메모: 화면은 200자에서 자른다
  await memo.fill("가".repeat(NOTE_MAX + 50));
  expect((await memo.inputValue()).length).toBe(NOTE_MAX);
  await expect(block.getByText(`${NOTE_MAX} / ${NOTE_MAX}`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/f-02-memo-max.png`, fullPage: true });

  // 서버도 201자는 받지 않는다 (화면을 우회한 요청)
  const login = await request.post(`${API_BASE}/admin/auth/login`, {
    data: { email: CENTER_ADMIN, password: ADMIN_PASSWORD },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const tooLong = await request.post(`${API_BASE}/admin/found-items/${itemId}/in-person-pickup`, {
    headers: { authorization: `Bearer ${accessToken}` },
    data: { verificationNote: "가".repeat(NOTE_MAX + 1) },
  });
  expect(tooLong.status()).toBe(400);
  expect((await tooLong.json()).error.code).toBe("VALIDATION_ERROR");

  // 메모 적고 완료
  const note = "학생증 이름·학번 뒤 4자리 확인, 물건 특징 설명 일치 (e2e)";
  await memo.fill(note);
  await expect(block.getByText(`${note.length} / ${NOTE_MAX}`)).toBeVisible();
  const res = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/in-person-pickup"));
  await block.getByRole("button", { name: "대면 확인 후 수령 완료" }).click();
  const r = await res;
  expect(r.status()).toBe(200);
  expect(await r.json()).toMatchObject({ method: "IN_PERSON", status: "COMPLETED" });
  await expect(page.getByText("대면 확인 후 수령 완료로 기록했어요.")).toBeVisible();

  // 블록 사라짐, 수령 기록 행: 대면 · 처리 관리자(가림) · 메모 · 완료
  await expect(block).toHaveCount(0);
  const rec = page.getByRole("row").filter({ hasText: `메모: ${note}` });
  await expect(rec).toHaveCount(1);
  await expect(rec.getByRole("cell").first()).toHaveText("대면");
  await expect(rec).toContainText("처리 ce****@skuniv.ac.kr");
  await expect(rec).toContainText("계정 없음");
  await expect(rec).toContainText("완료");
  await page.screenshot({ path: `${SHOTS}/f-03-done.png`, fullPage: true });

  const after = await withE2eDb(async (db) => {
    const q = await db.query<{ item: string; method: string; status: string; admin: string; note: string }>(
      `SELECT f.status AS item, p.method, p.status, u.email AS admin, p.verification_note AS note
       FROM found_item f JOIN pickup p ON p.found_item_id = f.id
       JOIN "user" u ON u.id = p.processed_by_admin_id WHERE f.id = $1`,
      [itemId],
    );
    return q.rows;
  });
  expect(after).toEqual([{ item: "CLAIMED", method: "IN_PERSON", status: "COMPLETED", admin: CENTER_ADMIN, note }]);

  // 새로고침해도 블록 없음
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: `메모: ${note}` })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "대면 확인 후 수령" })).toHaveCount(0);
  expect(urlLeaks(reqs)).toEqual([]);
});
