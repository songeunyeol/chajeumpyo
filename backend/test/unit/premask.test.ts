// QA B3: 외부 AI로 보내기 전 글자 영역(카드번호·학번·이름)을 가리는 실제 모델 동작.
// 얼굴은 실제 사람 사진을 레포에 두지 않으려고 여기서는 "얼굴 없는 사진에서 0개"만 본다.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { onnxPremasker } from "../../src/privacy/premask";

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
