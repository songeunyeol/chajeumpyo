// e2e (a) 습득자: 로그인 없이 사진 등록 → 결과 화면. 등록 요청 본문에 좌표가 없는지(필드·EXIF) 확인한다 (B1·B3·B14).
import { expect, type Page, test } from "@playwright/test";
import {
  type CapturedForm,
  COORD_FIELD,
  captureFormData,
  hasExif,
  jpegWithGps,
  recordRequests,
  urlLeaks,
} from "./helpers";

const SHOTS = "e2e/.artifacts/screens";

async function startFinder(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /물건을 주웠어요/ }).click();
  await expect(page).toHaveURL(/\/found\/new$/);
  // C-02 동의 (처음 한 번)
  await page.getByText("모두 동의해요").click();
  await page.getByRole("button", { name: "동의하고 계속하기" }).click();
  await page.getByTestId("album-input").setInputFiles({
    name: "found.jpg",
    mimeType: "image/jpeg",
    buffer: await jpegWithGps(),
  });
  await page.getByRole("button", { name: /다음/ }).click();
  await expect(page).toHaveURL(/\/found\/new\/details$/);
}

/** 등록 요청(헤더 확인용) */
function captureRegister(page: Page) {
  return page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/v1/found-items"));
}

/** 앱이 보낸 등록 FormData (마지막 것) */
async function registerForm(read: () => Promise<CapturedForm[]>) {
  const forms = (await read()).filter((f) => f.url.endsWith("/api/v1/found-items"));
  expect(forms.length, "등록 FormData").toBeGreaterThan(0);
  const form = forms[forms.length - 1] as CapturedForm;
  const names = form.fields.map((f) => f.name);
  const image = form.fields.find((f) => f.name === "image");
  const text = form.fields
    .filter((f) => f.kind === "text")
    .map((f) => `${f.name}=${f.value}`)
    .join("&");
  return { names, image, text, imageBytes: Buffer.from(image?.base64 ?? "", "base64") };
}

test.describe("(a) 습득자 등록", () => {
  test("보관처에 맡김: 사진 EXIF로 건물 추천 → 등록됨, 본문에 좌표 없음", async ({ page }) => {
    // 준비물 확인: 올리는 사진에는 GPS EXIF가 있다
    expect(hasExif(await jpegWithGps())).toBe(true);
    const reqs = recordRequests(page);
    const readForms = await captureFormData(page);
    await startFinder(page);

    // F-02: 사진 EXIF GPS로 가장 가까운 건물(유담관)을 고른다
    await expect(page.getByText("유담관", { exact: true })).toBeVisible();
    await expect(page.getByText("사진 위치로 골랐어요")).toBeVisible();

    await page.getByRole("radio", { name: /보관처에 맡김/ }).click();
    await page.getByRole("radio", { name: /유담관 경비실/ }).click();
    await page.getByRole("checkbox", { name: /사람인지 확인해 주세요/ }).click();
    await page.screenshot({ path: `${SHOTS}/a-F02-details.png`, fullPage: true });

    const pending = captureRegister(page);
    const response = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/found-items"));
    await page.getByRole("button", { name: "등록하기" }).click();
    const req = await pending;

    // B14: 좌표 필드 없음, 정해진 필드만
    expect(req.headers()["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    const { names, image, text, imageBytes } = await registerForm(readForms);
    expect(names.filter((n) => COORD_FIELD.test(n))).toEqual([]);
    expect(new Set(names)).toEqual(
      new Set([
        "image",
        "buildingId",
        "storageType",
        "storagePlaceId",
        "consentVersion",
        "consentExternalAi",
        "consentLocation",
      ]),
    );
    // 텍스트 필드 값에도 좌표 숫자가 없다
    expect(text).not.toMatch(/37\.6\d+|127\.0\d+/);
    // 사진은 캔버스로 다시 그려 EXIF(GPS)가 빠졌다
    expect(image?.kind).toBe("file");
    expect(image?.type).toBe("image/jpeg");
    expect(imageBytes.length).toBeGreaterThan(1000);
    expect(imageBytes.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(hasExif(imageBytes)).toBe(false);
    // 캡차 토큰은 헤더로
    expect(req.headers()["x-captcha-token"]).toBeTruthy();

    expect((await response).status()).toBe(201);
    await expect(page).toHaveURL(/\/found\/new\/result$/);
    await expect(page.getByText("등록됐어요")).toBeVisible();
    await expect(page.getByText(/유담관 경비실/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/a-F04-result.png`, fullPage: true });

    expect(urlLeaks(reqs)).toEqual([]);
  });

  test("그 자리에 둔 고가품: 보관처에 맡겨 달라는 안내", async ({ page }) => {
    const readForms = await captureFormData(page);
    await startFinder(page);
    await expect(page.getByText("유담관", { exact: true })).toBeVisible();
    await page.getByRole("radio", { name: /그 자리에 둠/ }).click();
    await page.getByRole("checkbox", { name: /사람인지 확인해 주세요/ }).click();

    const pending = captureRegister(page);
    await page.getByRole("button", { name: "등록하기" }).click();
    await pending;
    const { names } = await registerForm(readForms);
    expect(names).not.toContain("storagePlaceId");
    expect(names.filter((n) => COORD_FIELD.test(n))).toEqual([]);

    // 가짜 AI는 늘 이어폰(고가품) → handOverAdvice
    await expect(page.getByText("가까운 보관처에 맡겨 주세요")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/a-F04-handover.png`, fullPage: true });
  });
});
