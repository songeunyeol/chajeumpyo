import type { Page, Request } from "@playwright/test";
import sharp from "sharp";

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
