// 찾은 사람 화면 ↔ 백엔드 연결 (테스트 연동용).
// API 주소: ?api=... 로 한 번 주면 기억한다. 없으면 이 페이지를 연 호스트의 4100 포트(휴대폰에서 PC IP로 열어도 맞게).
(function () {
  const params = new URLSearchParams(location.search);
  try {
    if (params.get("api")) sessionStorage.setItem("apiBase", params.get("api"));
  } catch (_) {}
  let saved = null;
  try {
    saved = sessionStorage.getItem("apiBase");
  } catch (_) {}
  const API_BASE = saved || `${location.protocol}//${location.hostname}:4100/api/v1`;

  /** 동의 화면 버전 (packages/shared/src/api/consent.ts의 CONSENT_VERSION) */
  const CONSENT_VERSION = "2026-10-12";
  /** 개발용 캡차 토큰. 백엔드가 CAPTCHA_MODE=off일 때만 통과한다 */
  const DEV_CAPTCHA_TOKEN = "dev-pass";
  /** 가장 가까운 건물로 볼 최대 거리 (packages/shared/src/geo.ts) */
  const NEAREST_MAX_DISTANCE_M = 300;

  /** packages/shared/src/enums.ts의 CATEGORY_LABELS */
  const CATEGORY_LABELS = {
    WALLET: "지갑",
    ID_CARD: "학생증·신분증",
    DRIVER_LICENSE: "운전면허증",
    PAYMENT_CARD: "체크·신용카드",
    TRANSIT_CARD: "교통카드",
    OTHER_CARD: "기타 카드",
    PHONE: "휴대폰",
    EARPHONE: "무선 이어폰",
    SMARTWATCH: "스마트워치",
    TABLET: "태블릿",
    LAPTOP: "노트북",
    CHARGER: "기타 전자기기",
    BAG: "가방",
    CLOTHING: "의류",
    HAT: "모자",
    BOOK: "교재·도서",
    GLASSES: "안경·선글라스",
    ACCESSORY: "시계·액세서리",
    CASH: "현금",
    UMBRELLA: "우산",
    TUMBLER: "텀블러·물병",
    KEY: "열쇠",
    STATIONERY: "필기구·필통",
    ETC: "기타",
  };

  /** packages/shared/src/enums.ts의 SUB_CATEGORY_LABELS */
  const SUB_CATEGORY_LABELS = {
    CABLE_CHARGER: "충전기·케이블",
    POWER_BANK: "보조배터리",
    MOUSE: "마우스",
    KEYBOARD: "키보드",
    USB_MEMORY: "USB·메모리",
    CAMERA: "카메라",
    GAME_CONSOLE: "게임기",
    WIRELESS_EARBUDS: "무선 이어폰",
    WIRED_EARPHONE: "유선 이어폰",
    HEADPHONE: "헤드폰",
    BACKPACK: "백팩",
    SHOULDER_BAG: "숄더·토트백",
    ECO_BAG: "에코백",
    POUCH: "파우치",
    SHOPPING_BAG: "쇼핑백",
    OUTER: "외투",
    TOP: "상의",
    BOTTOM: "하의",
    SCARF_GLOVES: "목도리·장갑",
    SHOES: "신발",
    LONG_WALLET: "장지갑",
    BIFOLD_WALLET: "반지갑",
    CARD_WALLET: "카드지갑",
    WRISTWATCH: "손목시계",
    JEWELRY: "반지·목걸이·귀걸이",
    HAIR_ACCESSORY: "머리핀·머리끈",
    TEXTBOOK: "전공책",
    NOTEBOOK: "노트·공책",
    PENCIL_CASE: "필통",
    CALCULATOR: "계산기",
    PEN: "펜",
    DOOR_KEY: "열쇠",
    CAR_KEY: "자동차 키",
    DOLL_KEYRING: "인형·키링",
    COSMETICS: "화장품",
    MEDICINE: "약·의약품",
  };

  /** 화면 이름: 세부 종류가 있으면 그 이름, 없으면 큰 종류 이름 (shared itemLabel) */
  const itemLabel = (category, sub) => (sub && SUB_CATEGORY_LABELS[sub]) || CATEGORY_LABELS[category] || "";

  class ApiError extends Error {
    constructor(status, body) {
      super(body?.error?.message || `요청이 실패했어요 (${status})`);
      this.status = status;
      this.code = body?.error?.code || "UNKNOWN";
      this.details = body?.error?.details || [];
    }
  }

  /** 모바일 테스터(_tester.html) 안에서 열렸으면 요청 기록을 테스터로 보낸다 */
  function log(entry) {
    try {
      if (window.top !== window) window.top.postMessage({ type: "api-log", ...entry }, location.origin);
    } catch (_) {}
  }

  async function call(path, init = {}) {
    const started = Date.now();
    const method = init.method || "GET";
    let res;
    try {
      res = await fetch(API_BASE + path, init);
    } catch (_) {
      log({ method, path, status: 0, ms: Date.now() - started, body: "연결 실패" });
      throw new ApiError(0, { error: { code: "NETWORK", message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." } });
    }
    const body = await res.json().catch(() => null);
    log({ method, path, status: res.status, ms: Date.now() - started, body });
    if (!res.ok) throw new ApiError(res.status, body);
    return body;
  }

  const store = {
    get(key) {
      try {
        const v = sessionStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (_) {
        return null;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch (_) {}
    },
  };

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(",");
    const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function distanceM(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
  }

  /** 지금 위치로 가장 가까운 건물. 좌표는 여기서만 쓰고 버린다. 권한 거부·300m 밖이면 null */
  function nearestBuilding(buildings) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          let best = null;
          for (const b of buildings) {
            const d = distanceM(here, b);
            if (!best || d < best.d) best = { b, d };
          }
          resolve(best && best.d <= NEAREST_MAX_DISTANCE_M ? best.b : null);
        },
        () => resolve(null),
        { timeout: 8000, maximumAge: 60_000 },
      );
    });
  }

  // 캡차 (Cloudflare Turnstile). 사이트 키는 GET /config에서 받는다(코드에 박지 않음).
  // 토큰은 한 번만 쓸 수 있고 약 300초 뒤 만료라, 쓰면 지우고 오래된 건 버린다.
  const CAPTCHA_KEY = "captchaToken";
  const CAPTCHA_MAX_AGE_MS = 270_000;
  let configPromise = null;
  function config() {
    if (!configPromise) {
      configPromise = call("/config").catch(() => {
        configPromise = null; // 연결이 안 되면 다음에 다시 묻는다. 서버가 캡차를 켰다면 등록 때 CAPTCHA_FAILED로 안내된다
        return { captcha: { mode: "off", siteKey: null } };
      });
    }
    return configPromise;
  }

  function saveCaptchaToken(token) {
    try {
      if (token) sessionStorage.setItem(CAPTCHA_KEY, JSON.stringify({ token, at: Date.now() }));
      else sessionStorage.removeItem(CAPTCHA_KEY);
    } catch (_) {}
  }

  /** 아직 유효한 토큰을 꺼내고 지운다(한 번만 쓸 수 있음). off면 개발용 토큰 */
  async function takeCaptchaToken() {
    const { captcha } = await config();
    if (captcha.mode !== "turnstile") return DEV_CAPTCHA_TOKEN;
    const saved = store.get(CAPTCHA_KEY);
    saveCaptchaToken(null);
    return saved && Date.now() - saved.at < CAPTCHA_MAX_AGE_MS ? saved.token : null;
  }

  let turnstileScript = null;
  function loadTurnstile() {
    if (!turnstileScript) {
      turnstileScript = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = () => resolve(window.turnstile);
        s.onerror = () => {
          turnstileScript = null;
          reject(new Error("캡차를 불러오지 못했어요."));
        };
        document.head.appendChild(s);
      });
    }
    return turnstileScript;
  }

  /**
   * 캡차 위젯을 container에 붙인다. turnstile일 때만 스크립트를 부르고, 대부분은 보이지 않게 통과한다
   * (interaction-only: 의심스러울 때만 체크 상자가 나타남). ready()는 토큰을 받을 때까지 기다린다.
   */
  async function mountCaptcha(container) {
    const { captcha } = await config();
    if (captcha.mode !== "turnstile" || !captcha.siteKey) return { mode: "off", ready: () => Promise.resolve() };
    saveCaptchaToken(null); // 이전 화면에서 받은 토큰은 다시 못 쓸 수 있어 새로 받는다
    let token = null;
    let waiters = [];
    const settle = (t) => {
      token = t;
      saveCaptchaToken(t);
      if (t) {
        for (const w of waiters) w();
        waiters = [];
      }
    };
    const turnstile = await loadTurnstile();
    const widgetId = turnstile.render(container, {
      sitekey: captcha.siteKey,
      action: "found-analyze",
      appearance: "interaction-only",
      "refresh-expired": "auto",
      callback: (t) => settle(t),
      "expired-callback": () => settle(null),
      "error-callback": () => {
        settle(null);
        return true; // 위젯이 스스로 다시 시도한다
      },
    });
    return {
      mode: "turnstile",
      ready() {
        if (token) return Promise.resolve();
        return new Promise((resolve) => waiters.push(resolve));
      },
      reset() {
        settle(null);
        turnstile.reset(widgetId);
      },
    };
  }

  window.FoundApi = {
    API_BASE,
    config,
    mountCaptcha,
    CATEGORY_LABELS,
    itemLabel,
    ApiError,
    store,
    nearestBuilding,
    buildings: () => call("/buildings").then((r) => r.buildings),
    storagePlaces: (buildingId) =>
      call(`/storage-places${buildingId ? `?buildingId=${buildingId}` : ""}`).then((r) => r.storagePlaces),

    /** POST /found-items/analyze. 사진(dataURL)과 동의를 보내고 { id, confirmToken, category, isValuable, message } */
    async analyze(photoDataUrl, locationConsent) {
      const token = await takeCaptchaToken();
      const form = new FormData();
      form.append("image", dataUrlToBlob(photoDataUrl), "photo.jpg");
      form.append("consentVersion", CONSENT_VERSION);
      form.append("consentExternalAi", "true");
      form.append("consentLocation", locationConsent ? "true" : "false");
      return call("/found-items/analyze", {
        method: "POST",
        // 토큰이 없거나 만료됐으면 헤더 없이 보내고, 서버의 CAPTCHA_FAILED를 화면이 안내한다
        headers: token ? { "X-Captcha-Token": token } : {},
        body: form,
      });
    },

    /** POST /found-items/:id/confirm */
    confirm(id, body) {
      return call(`/found-items/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
})();
