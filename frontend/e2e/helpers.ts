import { readFileSync } from "node:fs";
import { expect, type Page, type Request } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { E2E_DB_NAME, e2eDatabaseUrl } from "./e2e-db.mts";

/** 유담관 좌표(개발 시드) 근처. 사진 EXIF GPS로 건물 추천이 되는지 본다 */
export const NEAR_YUDAM = { lat: 37.61549, lng: 127.01295 };

const dms = (deg: number) => {
  const d = Math.floor(deg);
  const mFloat = (deg - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 10000);
  return `${d}/1 ${m}/1 ${s}/10000`;
};

/** GPS EXIF가 들어간 JPEG. 업로드 본문에서 이 EXIF가 빠졌는지 확인하는 데 쓴다 */
export async function jpegWithGps(point = NEAR_YUDAM): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 240, g: 240, b: 235 } } })
    .composite([
      {
        input: Buffer.from(
          '<svg width="800" height="600"><rect x="250" y="180" width="300" height="240" rx="60" fill="#8a8a8a"/></svg>',
        ),
      },
    ])
    .withExif({
      IFD0: { Make: "e2e", Model: "chajeumpyo" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: dms(point.lat),
        GPSLongitudeRef: "E",
        GPSLongitude: dms(point.lng),
      },
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** JPEG 안에 EXIF 블록(APP1 "Exif\0\0", GPS 태그가 여기 들어간다)이 있는지 */
export function hasExif(jpeg: Buffer): boolean {
  return jpeg.includes(Buffer.from("Exif\0\0", "binary"));
}

export type CapturedForm = {
  url: string;
  fields: { name: string; kind: "text" | "file"; value?: string; type?: string; base64?: string }[];
};

/**
 * 앱이 fetch에 넘기는 FormData를 그대로 기록한다.
 * 크롬은 Blob이 든 multipart 본문을 Playwright에 주지 않으므로(request.postDataBuffer() === null),
 * 네트워크로 나가기 직전의 FormData 객체를 페이지 안에서 읽는다. 파일은 바이트 그대로(base64).
 */
export async function captureFormData(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __forms: unknown[] };
    w.__forms = [];
    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body instanceof FormData) {
        const fields: unknown[] = [];
        for (const [name, v] of init.body.entries()) {
          if (typeof v === "string") fields.push({ name, kind: "text", value: v });
          else {
            const bytes = new Uint8Array(await v.arrayBuffer());
            let bin = "";
            for (const b of bytes) bin += String.fromCharCode(b);
            fields.push({ name, kind: "file", type: v.type, base64: btoa(bin) });
          }
        }
        w.__forms.push({ url: String(input instanceof Request ? input.url : input), fields });
      }
      return orig(input, init);
    };
  });
  return async (): Promise<CapturedForm[]> =>
    page.evaluate(() => (window as unknown as { __forms: CapturedForm[] }).__forms);
}

/** 페이지가 보낸 모든 API 요청 기록. 토큰이 URL에 없는지 등을 확인한다 */
export function recordRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/") || r.url().includes("/files/")) seen.push(r);
  });
  return seen;
}

/** 토큰·좌표가 URL에 없는지 */
export function urlLeaks(reqs: Request[]): string[] {
  return reqs
    .map((r) => r.url())
    .filter((u) => /token|bearer|lat=|lng=|latitude|longitude|eyJ[A-Za-z0-9_-]{10,}/i.test(new URL(u).search));
}

/** 좌표처럼 보이는 필드 이름 */
export const COORD_FIELD = /^(lat|lng|lon|long|latitude|longitude|gps|coords?|location|position|geo)/i;

// ---- 분실자 흐름 (b)(c)(d) ----

export const SHOTS = "e2e/.artifacts/screens";

/** 가짜 AI가 습득물에 저장하는 값 중 분실자 설명·화면 문구에 없는 것. 통과 전 화면 어디에도 나오면 안 된다 */
export const STORED_ONLY = /곰돌이|스티커|긁힘|오른쪽 아래|흰색|화이트|WHITE|애플|Apple|에어팟/;
/** 점수·순위처럼 보이는 글 */
export const SCORE_LIKE = /\d+\s*(%|점)|점수|순위|유사도|일치율/;

/** C-01 → C-03 체험 시작(AI 동의 + 개발용 캡차) → L-03 */
export async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /체험해 보기/ }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await page.getByText("사진 외부 AI 처리에 동의해요").click();
  await expect(page.getByRole("checkbox", { name: /사진 외부 AI 처리에 동의해요/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /사람인지 확인해 주세요/ }).click();
  await page.getByRole("button", { name: "체험 시작하기" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** L-03 → L-04 신고(무선 이어폰, 오늘) → L-05. 신고 id를 돌려준다 */
export async function reportEarphone(page: Page, description: string): Promise<string> {
  await page.getByRole("button", { name: /분실 신고하기/ }).click();
  await expect(page).toHaveURL(/\/reports\/new$/);
  await page.getByRole("button", { name: "무선 이어폰", exact: true }).click();
  await page.getByLabel("어떤 물건인가요?").fill(description);
  await page.getByRole("button", { name: "신고하고 후보 보기" }).click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop() as string;
}

/** L-05의 후보 카드들 */
export const candidateCards = (page: Page) => page.getByRole("article", { name: /후보$/ });

/** API 로그(pino JSON 줄)에서 그 주소로 보낸 가장 최근 인증 코드 6자리 */
export function signupCodeFromLog(logPath: string, email: string): string | null {
  let last: string | null = null;
  for (const line of readFileSync(logPath, "utf8").split("\n")) {
    if (!line.includes(email)) continue;
    try {
      const j = JSON.parse(line) as { to?: string; text?: string };
      const m = j.to === email ? j.text?.match(/\b(\d{6})\b/) : null;
      if (m?.[1]) last = m[1];
    } catch {
      // JSON 아닌 줄
    }
  }
  return last;
}

/** e2e DB에 직접 붙는다. 이름을 current_database()로 다시 확인한 뒤에만 쓴다 */
export async function withE2eDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try {
    const { rows } = await db.query<{ db: string }>("SELECT current_database() AS db");
    if (rows[0]?.db !== E2E_DB_NAME) throw new Error(`e2e DB가 아니에요: ${rows[0]?.db}`);
    return await fn(db);
  } finally {
    await db.end();
  }
}
