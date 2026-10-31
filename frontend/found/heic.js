// 아이폰 HEIC 사진 바꾸기. photo.html이 api.js 다음에 불러온다.
// Safari는 HEIC를 그냥 읽지만 크롬·안드로이드·PC는 못 읽어 "사진을 읽지 못했어요"가 떴다(QA 10/31).
// 브라우저가 못 읽은 HEIC만 libheif(1.19.8, 순수 JS 빌드, LGPL-3.0)를 그때 불러와 JPEG로 바꾼다.
// 순수 JS 빌드라 eval·wasm·워커 없이 돌아서 화면 CSP를 넓히지 않는다. 보통 JPEG 사진에는 아무것도 받지 않는다.
(() => {
  const LIBHEIF_SRC = "/vendor/libheif.js";
  const LIBHEIF_SRI = "sha384-9IE9Xoid8MXnZ1uXS86rA3GFl+wua55vphkQc3k9vLGqUdMUmbUvf6nrWBx6Z+a4";
  /** HEIF 계열 파일 상자(ftyp)의 브랜드. 확장자·형식이 비어 있어도 내용으로 알아본다 */
  const BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

  /** 이름·형식으로 HEIC인지. 안드로이드·PC는 형식이 비어 오기도 해서 확장자도 본다 */
  function looksHeic(file) {
    const type = (file.type || "").toLowerCase();
    return type === "image/heic" || type === "image/heif" || /\.hei[cf]$/i.test(file.name || "");
  }

  /** 파일 앞 12바이트의 ftyp 브랜드로 HEIC인지 */
  async function isHeic(file) {
    if (looksHeic(file)) return true;
    try {
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const text = String.fromCharCode(...head.slice(4, 12));
      return text.slice(0, 4) === "ftyp" && BRANDS.has(text.slice(4, 8));
    } catch (_) {
      return false;
    }
  }

  let libPromise = null;
  function loadLib() {
    if (!libPromise) {
      libPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LIBHEIF_SRC;
        s.integrity = LIBHEIF_SRI;
        s.crossOrigin = "anonymous";
        s.onload = () =>
          typeof window.libheif === "function" ? resolve(window.libheif()) : reject(new Error("libheif"));
        s.onerror = () => {
          libPromise = null;
          reject(new Error("libheif"));
        };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  /** HEIC 파일 → JPEG File (긴 변 maxSide px). 실패하면 throw */
  async function toJpeg(file, maxSide = 1600) {
    const lib = await loadLib();
    const data = new Uint8Array(await file.arrayBuffer());
    const images = new lib.HeifDecoder().decode(data);
    if (!images || images.length === 0) throw new Error("HEIC 이미지 없음");
    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();
    const full = document.createElement("canvas");
    full.width = width;
    full.height = height;
    const ctx = full.getContext("2d");
    const pixels = ctx.createImageData(width, height);
    await new Promise((resolve, reject) => {
      image.display(pixels, (shown) => (shown ? resolve() : reject(new Error("HEIC 디코딩 실패"))));
    });
    ctx.putImageData(pixels, 0, 0);
    for (const img of images) img.free?.();

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const out = document.createElement("canvas");
    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale);
    out.getContext("2d").drawImage(full, 0, 0, out.width, out.height);
    const blob = await new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("JPEG 변환 실패");
    const name = (file.name || "photo").replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  }

  window.FoundHeic = { looksHeic, isHeic, toJpeg };
})();
