import sharp, { type Sharp } from "sharp";

/** 픽셀마다 값이 다른 잡음 사진. 블러 여부를 표준편차로 확인할 수 있다. */
export async function noisyJpeg(width = 400, height = 300, extra?: (img: Sharp) => Sharp) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  let img = sharp(raw, { raw: { width, height, channels: 3 } });
  if (extra) img = extra(img);
  return img.jpeg().toBuffer();
}

/** 사진의 첫 채널 표준편차. 흐릴수록 작다. */
export async function sharpness(image: Buffer) {
  return (await sharp(image).stats()).channels[0]?.stdev ?? 0;
}

/** GPS 위치와 회전(orientation 6: 시계 방향 90도) 정보가 든 사진 */
export function jpegWithGpsAndRotation() {
  // 회전 값은 withExif가 아니라 withMetadata로 넣어야 실제로 기록된다
  return noisyJpeg(400, 200, (img) =>
    img
      .withExif({
        IFD0: { Make: "TestPhone" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "37/1 36/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "127/1 1/1 0/1",
        },
      })
      .withMetadata({ orientation: 6 }),
  );
}
