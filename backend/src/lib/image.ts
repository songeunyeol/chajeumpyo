import type { SensitiveRegion } from "@chajeumpyo/shared";
import sharp, { type OverlayOptions } from "sharp";
import { AppError } from "./errors";

/** 저장용 원본: 긴 변 기준 크기 (관리자 확인용) */
const ORIGINAL_MAX_PX = 1600;
/** 분실자에게 보여줄 공개본 크기 */
const PUBLIC_MAX_PX = 1024;
/** 민감 정보 블러 강도. 글자·얼굴을 알아볼 수 없을 정도 */
const BLUR_SIGMA = 25;
/** 후보 카드용 블러본 크기와 강도. 종류·대략의 모양만 남고 스티커·흠집·글자는 알아볼 수 없을 정도 (open-issues #29) */
const THUMB_MAX_PX = 320;
const THUMB_BLUR_SIGMA = 18;
/** 개인정보 영역을 가릴 때 AI 좌표 오차를 감안해 사방으로 넓히는 비율 */
const REGION_PADDING = 0.08;

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

/**
 * 판정 통과 후 보여줄 공개본 (F-03, F-10).
 * - 민감하지 않으면 1024px 선명본
 * - 민감하고 영역을 알면 그 영역만 강하게 흐린 선명본 (리뷰 PR #12)
 * - 민감한데 영역을 모르거나 AI가 실패했으면 전체를 흐린다 (애매하면 흐리게, F-03)
 */
export async function makePublicImage(
  normalized: Buffer,
  privacy: { sensitive: boolean; regions: SensitiveRegion[] },
): Promise<Buffer> {
  const resized = await sharp(normalized)
    .resize(PUBLIC_MAX_PX, PUBLIC_MAX_PX, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  if (!privacy.sensitive) return sharp(resized).jpeg({ quality: 80 }).toBuffer();
  if (privacy.regions.length === 0) return sharp(resized).blur(BLUR_SIGMA).jpeg({ quality: 80 }).toBuffer();
  return blurRegions(resized, privacy.regions);
}

/** 영역마다 원본을 잘라 흐린 뒤 같은 자리에 덮는다 */
async function blurRegions(image: Buffer, regions: SensitiveRegion[]): Promise<Buffer> {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error("이미지 크기를 읽지 못했어요.");
  const overlays: OverlayOptions[] = [];
  for (const r of regions) {
    const padX = r.width * REGION_PADDING;
    const padY = r.height * REGION_PADDING;
    const left = Math.max(0, Math.floor((r.x - padX) * width));
    const top = Math.max(0, Math.floor((r.y - padY) * height));
    const right = Math.min(width, Math.ceil((r.x + r.width + padX) * width));
    const bottom = Math.min(height, Math.ceil((r.y + r.height + padY) * height));
    const w = right - left;
    const h = bottom - top;
    if (w < 1 || h < 1) continue;
    const patch = await sharp(image).extract({ left, top, width: w, height: h }).blur(BLUR_SIGMA).toBuffer();
    overlays.push({ input: patch, left, top });
  }
  return sharp(image).composite(overlays).jpeg({ quality: 80 }).toBuffer();
}

/** 후보 카드용 강한 블러본. 판정 전 누구에게나 보이므로 민감 여부와 관계없이 항상 흐린다 (open-issues #29, QA B7·B8) */
export async function makeThumbImage(normalized: Buffer): Promise<Buffer> {
  return sharp(normalized)
    .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true })
    .blur(THUMB_BLUR_SIGMA)
    .jpeg({ quality: 70 })
    .toBuffer();
}
