// QA B3: 외부 AI로 보내기 전 글자 영역(카드번호·학번·이름)을 가리는 실제 모델 동작.
// 얼굴은 실제 사람 사진을 레포에 두지 않으려고 여기서는 "얼굴 없는 사진에서 0개"만 본다.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MASK_COLOR, onnxPremasker } from "../../src/privacy/premask";

const jpeg = (svg: string) => sharp(Buffer.from(svg)).jpeg().toBuffer();

/** 기울어진 카드 위 카드번호·이름 */
const CARD = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="#c9b79c"/>
<g transform="rotate(-8 600 450)"><rect x="250" y="250" width="700" height="440" rx="30" fill="#2a4d8f"/>
<text x="300" y="520" font-size="54" fill="#fff" font-family="monospace" letter-spacing="6">1234 5678 9012 3456</text>
<text x="300" y="620" font-size="34" fill="#fff" font-family="sans-serif">HONG GILDONG 12/28</text></g></svg>`;

/** 글자 없는 흰 이어폰 케이스(가운데 이음선). 반짝이는 큰 면을 글자로 잘못 보면 안 된다 */
const CASE = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="#8d8d86"/>
<rect x="420" y="330" width="360" height="260" rx="110" fill="#f4f4f2"/>
<line x1="430" y1="450" x2="770" y2="450" stroke="#ccc" stroke-width="4"/></svg>`;

/** 카드번호 줄 안쪽 영역의 평균 밝기 차이. 가렸으면 흰 글자가 사라져 크게 바뀐다 */
async function regionDiff(a: Buffer, b: Buffer, region: { left: number; top: number; width: number; height: number }) {
  const [ra, rb] = await Promise.all([a, b].map((img) => sharp(img).extract(region).greyscale().raw().toBuffer()));
  let diff = 0;
  for (let i = 0; i < (ra as Buffer).length; i++) diff += Math.abs(((ra as Buffer)[i] ?? 0) - ((rb as Buffer)[i] ?? 0));
  return diff / (ra as Buffer).length;
}

describe("AI 전송 전 가리기 (QA B3)", () => {
  it("카드번호와 이름 줄을 가린다", async () => {
    const card = await jpeg(CARD);
    const r = await onnxPremasker(card);
    expect(r.texts).toBeGreaterThanOrEqual(1);
    expect(r.faces).toBe(0);
    // 번호 줄 가운데 (회전을 감안해 넉넉히)
    expect(await regionDiff(card, r.image, { left: 420, top: 440, width: 360, height: 60 })).toBeGreaterThan(20);
    // 크기는 그대로라 AI 좌표(민감 영역)를 그대로 쓸 수 있다
    const [m1, m2] = await Promise.all([sharp(card).metadata(), sharp(r.image).metadata()]);
    expect([m2.width, m2.height]).toEqual([m1.width, m1.height]);
  }, 30_000);

  it("글자 없는 물건의 큰 면은 가리지 않는다 (반짝이는 케이스를 글자로 오인 금지)", async () => {
    const plain = await jpeg(CASE);
    const r = await onnxPremasker(plain);
    expect(r.faces).toBe(0);
    // 이음선 같은 가는 줄은 글자 줄로 잡힐 수 있지만, 케이스 몸통(이음선 위·아래)은 그대로
    expect(await regionDiff(plain, r.image, { left: 470, top: 360, width: 260, height: 70 })).toBeLessThan(2);
    expect(await regionDiff(plain, r.image, { left: 470, top: 480, width: 260, height: 80 })).toBeLessThan(2);
  }, 30_000);
});

// ---- QA B3 재확인 (10/28): 가린 상자 밖에 글자 획이 남으면 안 된다 ----

/**
 * 가까이 찍은 카드. 글자가 클수록 감지된 줄이 실제 획보다 작게 잡혀 윗부분이 남기 쉽다.
 * text=false면 같은 그림에서 글자만 뺀다(글자 픽셀 위치를 얻는 데 쓴다).
 */
function closeCard(o: { width: number; height: number; font: number; family: string; fg: string; bg: string }) {
  const { width: W, height: H, font } = o;
  const x = W * 0.04 + 60;
  const y = H * 0.05 + H * 0.9 * 0.55;
  return (text: boolean) => `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#3b3b3b"/><rect x="${W * 0.04}" y="${H * 0.05}" width="${W * 0.92}" height="${H * 0.9}" rx="40" fill="${o.bg}"/>
${
  text
    ? `<text x="${x}" y="${y}" font-size="${font}" fill="${o.fg}" font-family="${o.family}" letter-spacing="4">1234 5678 9012 3456</text>
<text x="${x}" y="${y + font * 1.4}" font-size="${font * 0.6}" fill="${o.fg}" font-family="${o.family}">HONG GILDONG</text>
<text x="${x + font * 7.5}" y="${y + font * 1.4}" font-size="${font * 0.6}" fill="${o.fg}" font-family="${o.family}">12/28</text>`
    : ""
}</svg>`;
}

/** 가짜 학생증: 학교 이름 띠, 얼굴 자리(원), 이름·학번·학과 */
function studentId(text: boolean) {
  return `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="#5f6b5a"/>
<rect x="280" y="250" width="640" height="400" rx="18" fill="#f3f1ea"/><rect x="280" y="250" width="640" height="70" fill="#1e5b3d"/>
<circle cx="420" cy="480" r="80" fill="#e2c3a4"/><circle cx="395" cy="465" r="8" fill="#333"/><circle cx="445" cy="465" r="8" fill="#333"/>
${
  text
    ? `<text x="310" y="298" font-size="30" fill="#fff" font-family="sans-serif" font-weight="bold">SEOKYEONG UNIVERSITY</text>
<text x="540" y="420" font-size="40" fill="#111" font-family="sans-serif" font-weight="bold">KIM MINJI</text>
<text x="540" y="490" font-size="32" fill="#222" font-family="monospace">2023101234</text>
<text x="540" y="550" font-size="24" fill="#333" font-family="sans-serif">Computer Engineering</text>`
    : ""
}</svg>`;
}

/**
 * 글자 픽셀 중 가린 상자 밖에 남은 비율.
 * 글자 있는/없는 그림의 차이로 글자 픽셀을 찾고, 가린 사본에서 그 자리가 가림 색이 아니면 남은 것으로 센다.
 */
async function leftoverGlyphs(svg: (text: boolean) => string) {
  const raw = (input: Buffer) => sharp(input).greyscale().raw().toBuffer();
  const [withText, without] = await Promise.all([raw(Buffer.from(svg(true))), raw(Buffer.from(svg(false)))]);
  const r = await onnxPremasker(await jpeg(svg(true)));
  const out = await raw(r.image);
  const mask = Number.parseInt(MASK_COLOR.slice(1, 3), 16);
  let glyph = 0;
  let left = 0;
  for (let i = 0; i < withText.length; i++) {
    if (Math.abs((withText[i] ?? 0) - (without[i] ?? 0)) <= 24) continue;
    glyph++;
    if (Math.abs((out[i] ?? 0) - mask) > 20) left++;
  }
  return { glyph, left, ratio: left / glyph, texts: r.texts };
}

describe("가린 상자 밖에 글자가 남지 않는다 (QA B3 재확인)", () => {
  // 예전 설정(줄 높이의 0.6배)에서 남은 비율: 세리프 5.8%, 산세리프 2.4%, 학생증 0.1% 미만. 지금은 셋 다 0
  const cases: [string, (text: boolean) => string][] = [
    [
      "가까이 찍은 밝은 카드, 세리프 큰 번호",
      closeCard({ width: 1600, height: 1000, font: 90, family: "serif", fg: "#111", bg: "#f2efe6" }),
    ],
    [
      "작은 사진의 흰 카드, 산세리프 번호",
      closeCard({ width: 1000, height: 640, font: 60, family: "sans-serif", fg: "#111", bg: "#ffffff" }),
    ],
    ["얼굴 자리가 있는 학생증 (이름·학번·학과)", studentId],
  ];
  for (const [name, svg] of cases) {
    it(name, async () => {
      const { glyph, ratio, texts } = await leftoverGlyphs(svg);
      expect(glyph).toBeGreaterThan(1000); // 글자가 실제로 그려졌는지
      expect(texts).toBeGreaterThanOrEqual(2);
      expect(ratio).toBeLessThan(0.002);
    }, 30_000);
  }
});

describe("글자 없는 물건은 넓힌 상자로도 가리지 않는다", () => {
  /** 검정 장우산: 펼친 천, 살, 손잡이 */
  const UMBRELLA = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="#b9c4c9"/>
<path d="M250 450 Q600 120 950 450 Z" fill="#1d1d22"/>
<path d="M600 230 L600 450 M430 300 L480 450 M770 300 L720 450" stroke="#33333a" stroke-width="5"/>
<rect x="592" y="450" width="16" height="280" fill="#2a2a2a"/>
<path d="M600 730 Q600 790 650 790 Q690 790 690 750" fill="none" stroke="#5a3b22" stroke-width="18"/></svg>`;
  /** 남색 백팩: 몸통, 앞주머니, 지퍼, 어깨끈 */
  const BAG = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="#d8d0c4"/>
<rect x="400" y="180" width="400" height="560" rx="120" fill="#24345c"/>
<rect x="460" y="470" width="280" height="220" rx="50" fill="#1c2a4b"/>
<line x1="470" y1="500" x2="730" y2="500" stroke="#b0b4bd" stroke-width="5" stroke-dasharray="6 4"/>
<path d="M470 210 Q600 150 730 210" fill="none" stroke="#151f38" stroke-width="22"/></svg>`;

  it("우산 천과 대 (J자 손잡이 끝은 글자로 잡힐 수 있지만 그 근처만)", async () => {
    const plain = await jpeg(UMBRELLA);
    const r = await onnxPremasker(plain);
    expect(r.faces).toBe(0);
    expect(await regionDiff(plain, r.image, { left: 380, top: 330, width: 440, height: 100 })).toBeLessThan(2);
    expect(await regionDiff(plain, r.image, { left: 560, top: 470, width: 80, height: 130 })).toBeLessThan(2);
  }, 30_000);

  it("가방 몸통과 앞주머니 (지퍼 줄은 글자로 잡혀도 몸통은 그대로)", async () => {
    const plain = await jpeg(BAG);
    const r = await onnxPremasker(plain);
    expect(r.faces).toBe(0);
    expect(await regionDiff(plain, r.image, { left: 450, top: 260, width: 300, height: 180 })).toBeLessThan(2);
    expect(await regionDiff(plain, r.image, { left: 480, top: 560, width: 240, height: 110 })).toBeLessThan(2);
  }, 30_000);
});
