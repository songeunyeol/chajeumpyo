import { MAX_IMAGE_MB } from "@chajeumpyo/shared";

/** 업로드 전 긴 변 최대 크기. 서버는 1600px로 다시 줄인다 */
const UPLOAD_MAX_PX = 2048;
const UPLOAD_QUALITY = 0.85;

export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/**
 * 업로드할 사진을 브라우저 안에서 JPEG로 다시 그린다.
 * - 캔버스로 다시 그리면 EXIF(GPS 위치 포함)가 모두 빠진다 (B14: 좌표는 서버로 보내지 않음).
 *   건물 추천용 EXIF GPS는 이 함수를 부르기 **전에** 원본 파일에서 읽어야 한다 (lib/building-suggest.ts).
 * - 큰 사진을 줄여 10MB 제한·업로드 시간을 지킨다.
 * - 브라우저가 못 여는 형식(크롬의 HEIC 등)이면 원본을 그대로 돌려준다. 서버가 메타데이터를 지우고 저장한다.
 */
export async function prepareUploadImage(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, UPLOAD_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", UPLOAD_QUALITY));
    return blob ?? file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
