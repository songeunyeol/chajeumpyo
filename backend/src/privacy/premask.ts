import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";
import sharp, { type OverlayOptions } from "sharp";
import { logger } from "../lib/logger";

// 외부 AI로 보내기 전, 서버 안에서 얼굴과 글자 영역(카드번호·학번·이름)을 가린다 (QA B3, 위협모델 T4).
// 감지는 작은 ONNX 모델 두 개로 이 서버에서만 한다. 사진은 밖으로 나가지 않는다.
// - 얼굴: Ultra-Light-Fast-Generic-Face-Detector RFB-320 (MIT)
// - 글자: PaddleOCR PP-OCRv4 글자 영역 감지(det) 모델 (Apache-2.0). 글자를 읽지는 않고 자리만 찾는다
// 모델 출처와 라이선스는 backend/models/README.md.

export type PremaskResult = { image: Buffer; faces: number; texts: number };
/** 저장용 JPEG를 받아 가린 JPEG를 돌려준다. 실패하면 throw하고, 호출한 쪽은 원본을 AI로 보내지 않는다. */
export type Premasker = (jpeg: Buffer) => Promise<PremaskResult>;

type Box = [x1: number, y1: number, x2: number, y2: number];

const FACE_INPUT = { width: 320, height: 240 };
const FACE_THRESHOLD = 0.75;
/** 겹친 얼굴 후보를 하나로 합치는 기준 */
const FACE_NMS_IOU = 0.3;
/**
 * 컬러 사진에서 얼굴 상자 안 피부색 픽셀이 이보다 적으면 사람 얼굴이 아닌 물건(모자 로고, 털 인형 등)으로 보고 가리지 않는다.
 * 10/30 실제 사진·웹 사진: 실제 얼굴은 17~94%(목도리로 코·입을 덮은 얼굴 17%), 오탐한 데님 모자 2~6%.
 * 털 인형(15~20%)은 가린 얼굴과 겹쳐서 가리는 쪽으로 남긴다(개인정보 우선).
 */
const FACE_MIN_SKIN = 0.08;
/** 색이 있는 픽셀이 이보다 적으면 흑백 사진으로 보고 피부색 검사를 하지 않는다(흑백 얼굴은 피부색 0%) */
const COLOR_PHOTO_MIN = 0.01;
/** 얼굴 상자는 머리카락·귀까지 가리게 사방으로 넓힌다 */
const FACE_PADDING = 0.15;
/** 글자 감지 입력의 긴 변 상한. 32의 배수로 맞춘다 */
const TEXT_MAX_SIDE = 960;
const TEXT_PIXEL_THRESHOLD = 0.3;
const TEXT_MIN_PIXELS = 12;
const TEXT_MIN_MEAN = 0.5;
/**
 * 크기가 이미지의 2%를 넘는 덩어리 중 글자 줄이 아니라 반짝이는 면(이어폰 케이스 등)으로 보는 것:
 * 가로로 길지 않거나(1.6배 미만), 조금 길어도(3배 미만) 속이 꽉 찬(채움 50% 초과) 것.
 * 카드 위 여러 줄 글자는 크게 묶여도 속이 성겨서(채움 10~20%) 남는다.
 */
const TEXT_BLOB_AREA = 0.02;
const TEXT_MIN_ASPECT = 1.6;
const TEXT_SOLID_ASPECT = 3;
const TEXT_SOLID_FILL = 0.5;
/**
 * 이미지의 5%를 넘으면서 속이 꽉 찬(채움 60% 초과) 긴 덩어리는 글자 줄이 아니라 물건 몸통이다.
 * 안경테 전체가 글자 한 줄로 잡혀 안경이 통째로 가려지고 AI가 "가려진 카드"로 본 일이 있었다 (10/29, 면적 6.9%·가로 5.4배·채움 68%).
 * 웹 사진 89장의 카드 글자 덩어리는 5%를 넘어도 채움 7~10%라 남는다.
 */
const TEXT_THICK_AREA = 0.05;
const TEXT_THICK_FILL = 0.6;
/**
 * 글자 상자 넓히기. PP-OCR(DBNet) 확률 지도는 글자 줄을 안쪽으로 줄여서 내놓으므로, 원래 후처리처럼
 * "넓이 × 비율 ÷ 둘레"만큼 다시 넓힌다 (PaddleOCR 기본 비율 1.5). 긴 줄이면 줄 높이의 비율/2배, 네모난 덩어리면 비율/4배다.
 * 예전 "줄 높이의 0.6배"는 긴 줄에서 원래 후처리(약 0.75배)보다 작아서, 가까이 찍은 카드의 큰 글자 윗부분과
 * 끝 글자가 상자 밖에 남았다 (QA B3, 10/28). 가짜 카드·학생증 17종에서 남은 글자 픽셀이 0이 되는 최소 비율(1.8)에
 * 여유를 더해 2.4로 하고, 위아래는 획이 더 튀어나와서 1.2배 더 넓힌다. 네모난 덩어리(글자처럼 보이는 손잡이 등)는
 * 예전과 비슷하게(0.6배) 넓혀서 물건 몸통을 덜 가린다.
 */
const TEXT_UNCLIP = 2.4;
const TEXT_UNCLIP_Y = 1.2;
export const MASK_COLOR = "#6b6b6b";

function modelsDir(): string {
  // src/privacy/에서 실행(tsx)하든 dist/에서 실행하든 backend/models를 찾는다
  for (const rel of ["../../models/", "../models/"]) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(`${dir}face-ultralight-rfb320.onnx`)) return dir;
  }
  throw new Error("backend/models의 가리기 모델을 찾지 못했어요.");
}

let sessions: Promise<{ face: ort.InferenceSession; text: ort.InferenceSession }> | null = null;
function loadSessions() {
  if (!sessions) {
    const dir = modelsDir();
    sessions = Promise.all([
      ort.InferenceSession.create(`${dir}face-ultralight-rfb320.onnx`, { logSeverityLevel: 3 }),
      ort.InferenceSession.create(`${dir}text-ppocrv4-det.onnx`, { logSeverityLevel: 3 }),
    ]).then(([face, text]) => ({ face, text }));
    sessions.catch(() => {
      sessions = null;
    });
  }
  return sessions;
}

/** RGB를 CHW float 텐서로. norm은 채널별 정규화 */
async function chwTensor(image: Buffer, width: number, height: number, norm: (v: number, c: number) => number) {
  const data = await sharp(image).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) out[c * plane + i] = norm(data[i * 3 + c] ?? 0, c);
  return new ort.Tensor("float32", out, [1, 3, height, width]);
}

function iou(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
}

async function detectFaces(session: ort.InferenceSession, image: Buffer, W: number, H: number): Promise<Box[]> {
  const input = await chwTensor(image, FACE_INPUT.width, FACE_INPUT.height, (v) => (v - 127) / 128);
  const out = await session.run({ [session.inputNames[0] as string]: input });
  const scores = out.scores?.data as Float32Array;
  const boxes = out.boxes?.data as Float32Array;
  const found: { score: number; box: Box }[] = [];
  for (let i = 0; i < scores.length / 2; i++) {
    const score = scores[i * 2 + 1] ?? 0;
    if (score <= FACE_THRESHOLD) continue;
    const at = (k: number) => boxes[i * 4 + k] ?? 0;
    found.push({ score, box: [at(0) * W, at(1) * H, at(2) * W, at(3) * H] });
  }
  found.sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const f of found) if (kept.every((k) => iou(k, f.box) < FACE_NMS_IOU)) kept.push(f.box);
  return kept;
}

function padFace([x1, y1, x2, y2]: Box): Box {
  const dx = (x2 - x1) * FACE_PADDING;
  const dy = (y2 - y1) * FACE_PADDING;
  return [x1 - dx, y1 - dy, x2 + dx, y2 + dy];
}

async function detectText(session: ort.InferenceSession, image: Buffer, W: number, H: number): Promise<Box[]> {
  const scale = Math.min(1, TEXT_MAX_SIDE / Math.max(W, H));
  const w = Math.max(32, Math.round((W * scale) / 32) * 32);
  const h = Math.max(32, Math.round((H * scale) / 32) * 32);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const input = await chwTensor(image, w, h, (v, c) => (v / 255 - (mean[c] ?? 0)) / (std[c] ?? 1));
  const out = await session.run({ [session.inputNames[0] as string]: input });
  const prob = out[session.outputNames[0] as string]?.data as Float32Array;

  // 확률 지도에서 이어진 글자 픽셀 덩어리마다 상자 하나
  const seen = new Uint8Array(w * h);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || (prob[start] ?? 0) < TEXT_PIXEL_THRESHOLD) continue;
    let [x1, y1, x2, y2, count, sum] = [w, h, 0, 0, 0, 0];
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p / w) | 0;
      count++;
      sum += prob[p] ?? 0;
      x1 = Math.min(x1, x);
      x2 = Math.max(x2, x);
      y1 = Math.min(y1, y);
      y2 = Math.max(y2, y);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!seen[q] && (prob[q] ?? 0) >= TEXT_PIXEL_THRESHOLD) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (count < TEXT_MIN_PIXELS || sum / count < TEXT_MIN_MEAN) continue;
    const bw = x2 - x1 + 1;
    const bh = y2 - y1 + 1;
    const aspect = bw / bh;
    const fill = count / (bw * bh);
    const area = (bw * bh) / (w * h);
    const solid = fill > TEXT_SOLID_FILL;
    if (area > TEXT_BLOB_AREA && (aspect < TEXT_MIN_ASPECT || (aspect < TEXT_SOLID_ASPECT && solid))) continue;
    if (area > TEXT_THICK_AREA && fill > TEXT_THICK_FILL) continue;
    const offset = (TEXT_UNCLIP * bw * bh) / (2 * (bw + bh));
    const px = Math.max(3, offset);
    const py = Math.max(3, offset * TEXT_UNCLIP_Y);
    boxes.push([((x1 - px) / w) * W, ((y1 - py) / h) * H, ((x2 + px) / w) * W, ((y2 + py) / h) * H]);
  }
  return boxes;
}

/** YCbCr 피부색 범위 */
function isSkin(r: number, g: number, b: number): boolean {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

/** 색이 있는 픽셀 비율. 흑백 사진이면 0에 가깝다 */
async function colorRatio(image: Buffer): Promise<number> {
  const px = await sharp(image).resize(200, 200, { fit: "inside" }).removeAlpha().raw().toBuffer();
  let colored = 0;
  for (let p = 0; p < px.length; p += 3) {
    const [r, g, b] = [px[p] ?? 0, px[p + 1] ?? 0, px[p + 2] ?? 0];
    if (Math.hypot(-0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 * r - 0.418688 * g - 0.081312 * b) > 15) colored++;
  }
  return colored / (px.length / 3);
}

/** 넓히기 전 얼굴 상자 안 피부색 픽셀 비율 */
async function skinRatio(image: Buffer, [x1, y1, x2, y2]: Box, W: number, H: number): Promise<number> {
  const left = Math.max(0, Math.floor(x1));
  const top = Math.max(0, Math.floor(y1));
  const width = Math.min(W, Math.ceil(x2)) - left;
  const height = Math.min(H, Math.ceil(y2)) - top;
  if (width < 2 || height < 2) return 1;
  const px = await sharp(image).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
  let skin = 0;
  for (let p = 0; p < px.length; p += 3) if (isSkin(px[p] ?? 0, px[p + 1] ?? 0, px[p + 2] ?? 0)) skin++;
  return skin / (px.length / 3);
}

/** 컬러 사진에서 피부색이 거의 없는 얼굴 후보(물건 오탐)를 뺀다 */
async function dropNonSkinFaces(image: Buffer, faces: Box[], W: number, H: number): Promise<Box[]> {
  if (!faces.length || (await colorRatio(image)) < COLOR_PHOTO_MIN) return faces;
  const kept: Box[] = [];
  for (const f of faces) if ((await skinRatio(image, f, W, H)) >= FACE_MIN_SKIN) kept.push(f);
  return kept;
}

export const onnxPremasker: Premasker = async (jpeg) => {
  const { face, text } = await loadSessions();
  const { width: W = 0, height: H = 0 } = await sharp(jpeg).metadata();
  if (!W || !H) throw new Error("사진 크기를 읽지 못했어요.");
  const [detected, texts] = await Promise.all([detectFaces(face, jpeg, W, H), detectText(text, jpeg, W, H)]);
  const faces = (await dropNonSkinFaces(jpeg, detected, W, H)).map(padFace);
  const overlays: OverlayOptions[] = [];
  for (const [x1, y1, x2, y2] of [...faces, ...texts]) {
    const left = Math.max(0, Math.floor(x1));
    const top = Math.max(0, Math.floor(y1));
    const width = Math.min(W, Math.ceil(x2)) - left;
    const height = Math.min(H, Math.ceil(y2)) - top;
    if (width < 2 || height < 2) continue;
    const input = await sharp({ create: { width, height, channels: 3, background: MASK_COLOR } })
      .png()
      .toBuffer();
    overlays.push({ input, left, top });
  }
  const image = overlays.length ? await sharp(jpeg).composite(overlays).jpeg({ quality: 85 }).toBuffer() : jpeg;
  return { image, faces: faces.length, texts: texts.length };
};

let current: Premasker = onnxPremasker;

/** 테스트에서 가리기를 바꿔 끼울 때 쓴다 (실패, 호출 확인 등). */
export function setPremasker(premasker: Premasker) {
  current = premasker;
}

export function resetPremasker() {
  current = onnxPremasker;
}

/** 가린 사본. 실패하면 null — 호출한 쪽은 원본을 AI로 보내지 말고 검토 대기로 저장한다 */
export async function premaskSafely(jpeg: Buffer): Promise<PremaskResult | null> {
  try {
    return await current(jpeg);
  } catch (err) {
    logger.error({ err }, "AI 전송 전 가리기 실패 → AI 없이 검토 대기로 저장");
    return null;
  }
}
