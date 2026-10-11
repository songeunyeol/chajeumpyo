import sharp from "sharp";
import { AppError } from "./errors";

/** 저장용 원본: 긴 변 기준 크기 (관리자 확인용) */
const ORIGINAL_MAX_PX = 1600;
/** 분실자에게 보여줄 공개본 크기 */
const PUBLIC_MAX_PX = 1024;
/** 민감 정보 블러 강도. 글자·얼굴을 알아볼 수 없을 정도 */
const BLUR_SIGMA = 25;

const ACCEPTED = new Set(["jpeg", "png", "webp", "heif"]);

/**
 * 업로드 사진을 저장용 JPEG로 바꾼다.
 * EXIF 방향은 적용하고, 위치(GPS)를 포함한 메타데이터는 모두 버린다(sharp 기본 동작). 기능 명세서 F-01.
 */
export async function normalizeImage(input: Buffer): Promise<Buffer> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED.has(format)) {
    throw new AppError("VALIDATION_ERROR", "사진 파일(JPG, PNG, WEBP, HEIC)만 올릴 수 있어요.");
  }
  try {
    return await sharp(input)
      .rotate()
      .resize(ORIGINAL_MAX_PX, ORIGINAL_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError("VALIDATION_ERROR", "사진을 읽을 수 없어요. 다른 사진으로 다시 시도해 주세요.");
  }
}

/** 분실자에게 보여줄 공개본. 민감하면 전체를 흐리게 한다 (F-03, 부분 블러는 이후 개선). */
export async function makePublicImage(normalized: Buffer, blur: boolean): Promise<Buffer> {
  let img = sharp(normalized).resize(PUBLIC_MAX_PX, PUBLIC_MAX_PX, { fit: "inside", withoutEnlargement: true });
  if (blur) img = img.blur(BLUR_SIGMA);
  return img.jpeg({ quality: 80 }).toBuffer();
}
