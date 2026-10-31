// 관리자 화면 ↔ 백엔드 연결. 화면마다 이 파일 하나만 불러온다.
// API 주소는 found/api.js와 같은 규칙: 개발 주소에서만 ?api=... 로 한 번 주면 기억하고, 없으면
// 개발(정적 서버 5500 포트)은 이 호스트의 4000 포트, 배포는 같은 주소의 /api/v1.
// 로그인 토큰은 sessionStorage에만 둔다(탭을 닫으면 사라진다).
(() => {
  // ?api= 주소 바꾸기는 개발(포트가 붙은 주소, localhost, 사설 IP)에서만 받는다. 배포 주소에서는 무시한다
  const devHost =
    location.port !== "" || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const params = new URLSearchParams(location.search);
  let saved = null;
  try {
    if (!devHost) sessionStorage.removeItem("apiBase");
    else {
      if (params.get("api")) sessionStorage.setItem("apiBase", params.get("api"));
      saved = sessionStorage.getItem("apiBase");
    }
  } catch (_) {}
  const devStatic = location.port === "5500";
  const API_BASE =
    saved || (devStatic ? `${location.protocol}//${location.hostname}:4000/api/v1` : `${location.origin}/api/v1`);

  const AUTH_KEY = "adminAuth";

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

  /** packages/shared/src/enums.ts의 SUB_CATEGORIES (물건 상세에서 세부 종류를 고칠 때 보기) */
  const SUB_CATEGORIES = {
    CHARGER: ["CABLE_CHARGER", "POWER_BANK", "MOUSE", "KEYBOARD", "USB_MEMORY", "CAMERA", "GAME_CONSOLE"],
    EARPHONE: ["WIRELESS_EARBUDS", "WIRED_EARPHONE", "HEADPHONE"],
    BAG: ["BACKPACK", "SHOULDER_BAG", "ECO_BAG", "POUCH", "SHOPPING_BAG"],
    CLOTHING: ["OUTER", "TOP", "BOTTOM", "SCARF_GLOVES", "SHOES"],
    WALLET: ["LONG_WALLET", "BIFOLD_WALLET", "CARD_WALLET"],
    ACCESSORY: ["WRISTWATCH", "JEWELRY", "HAIR_ACCESSORY"],
    BOOK: ["TEXTBOOK", "NOTEBOOK"],
    STATIONERY: ["PENCIL_CASE", "CALCULATOR", "PEN"],
    KEY: ["DOOR_KEY", "CAR_KEY"],
    ETC: ["DOLL_KEYRING", "COSMETICS", "MEDICINE"],
  };

  /** packages/shared/src/enums.ts의 SUB_CATEGORY_LABELS (관리자 API가 세부 종류를 주면 이 이름으로 보인다) */
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

  /** packages/shared/src/enums.ts의 COLOR_LABELS (기본 12색) */
  const COLOR_LABELS = {
    WHITE: "흰색",
    BLACK: "검정",
    GRAY_SILVER: "회색·은색",
    RED: "빨강",
    ORANGE_CORAL: "주황·코럴",
    YELLOW: "노랑",
    GREEN: "초록",
    BLUE_TEAL: "파랑·청록",
    PURPLE: "보라",
    PINK_MAGENTA: "분홍·자홍",
    BROWN: "갈색",
    OTHER: "기타",
  };

  /** packages/shared/src/enums.ts의 FEATURE_KEY_LABELS */
  const FEATURE_KEY_LABELS = {
    sticker: "스티커",
    scratch: "흠집·긁힘",
    case: "케이스·커버",
    keyring: "키링·고리",
    contents: "안에 든 것",
    text: "글자·각인",
    pattern: "무늬·그림",
    other: "기타 특징",
  };
  /** packages/shared/src/enums.ts의 MAX_FEATURES */
  const MAX_FEATURES = 4;
  /** packages/shared/src/api/pickups.ts의 VERIFICATION_NOTE_MAX */
  const VERIFICATION_NOTE_MAX = 200;

  /** 습득물 상태 이름과 칩 모양 (색만으로 구분하지 않게 글자를 함께 쓴다) */
  const STATUS = {
    REVIEW: { label: "검토 대기", chip: "chip warn" },
    REGISTERED: { label: "등록됨", chip: "chip" },
    REVEALED: { label: "열람됨", chip: "chip" },
    CLAIMED: { label: "수령 완료", chip: "chip", mute: true },
    EXPIRED: { label: "기한 만료", chip: "chip", mute: true },
    ANALYZING: { label: "등록 중", chip: "chip", mute: true },
  };
  /** 끝난 상태 칩: palette.css 변수만 쓴다 */
  const MUTE_CHIP = "background:var(--paper);color:var(--mute)";
  /** 목록 필터 순서 */
  const STATUS_ORDER = ["REVIEW", "REGISTERED", "REVEALED", "CLAIMED", "EXPIRED", "ANALYZING"];

  const STORAGE_LABELS = { IN_PLACE: "그 자리에 둠", HANDED_OVER: "보관처에 맡김" };
  const MATCH_RESULT_LABELS = { PASS: "통과", BORDERLINE: "애매함", FAIL: "실패", NEED_MORE: "근거 부족(기회 안 씀)" };
  const PICKUP_METHOD_LABELS = {
    CENTER_QR: "수령 QR",
    SELF_REPORT: "직접 찾음",
    IN_PERSON: "대면 확인",
    DEMO: "체험",
  };
  const PICKUP_STATUS_LABELS = { ISSUED: "발급됨", COMPLETED: "완료", EXPIRED: "만료" };
  const NOTIFICATION_LABELS = {
    CLAIM_LOCKED: "대면 확인이 필요해요",
    MULTI_REVEAL: "여러 명이 열람했어요",
    NEW_CANDIDATE: "새 후보",
    SYSTEM: "알림",
    ITEM_INCOMING: "맡길 물건 등록",
    PICKUP_SCHEDULED: "수령 예정",
    VALUABLE_IN_PLACE: "그 자리에 둔 귀중품",
  };
  /** shared NOTIFICATION_KIND와 같게. ACTION: 사람이 판단할 일, INFO: 알아 두면 되는 일 */
  const NOTIFICATION_KIND = {
    NEW_CANDIDATE: "INFO",
    MULTI_REVEAL: "ACTION",
    CLAIM_LOCKED: "ACTION",
    SYSTEM: "ACTION",
    ITEM_INCOMING: "INFO",
    PICKUP_SCHEDULED: "INFO",
    VALUABLE_IN_PLACE: "ACTION",
  };
  /** shared CLOSED_REASON_LABELS와 같게 */
  const CLOSED_REASON_LABELS = {
    DISPOSED: "폐기·이관",
    MISREGISTERED: "잘못 등록",
  };
  /** 층 글자: shared floorLabel과 같게. -1 → "지하 1층" (QA 10/30 3차: 관리자만 "-1층"으로 보였음) */
  const floorLabel = (f) => (f === null || f === undefined ? "" : f < 0 ? `지하 ${-f}층` : `${f}층`);

  /** 화면 이름: 세부 종류가 있으면 그 이름, 없으면 큰 종류 이름 (shared itemLabel). 종류가 없으면 빈 글자 */
  const itemLabel = (category, sub) => (sub && SUB_CATEGORY_LABELS[sub]) || CATEGORY_LABELS[category] || "";

  class ApiError extends Error {
    constructor(status, body) {
      super(body?.error?.message || `요청이 실패했어요 (${status})`);
      this.status = status;
      this.code = body?.error?.code || "UNKNOWN";
      this.details = body?.error?.details || [];
    }
  }

  const auth = {
    get() {
      try {
        const v = JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null");
        if (v && v.expiresAt && Date.parse(v.expiresAt) <= Date.now()) {
          sessionStorage.removeItem(AUTH_KEY);
          return null;
        }
        return v;
      } catch (_) {
        return null;
      }
    },
    set(v) {
      try {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(v));
      } catch (_) {}
    },
    clear() {
      try {
        sessionStorage.removeItem(AUTH_KEY);
      } catch (_) {}
    },
  };

  /** 로그인 화면으로. 돌아올 화면을 next로 남긴다 */
  function toLogin() {
    auth.clear();
    const here = location.pathname.split("/").pop() + location.search;
    location.replace(`login.html?next=${encodeURIComponent(here)}`);
  }

  /** 로그인하지 않았으면 로그인 화면으로 보낸다. 로그인했으면 로그인 정보 */
  function requireLogin() {
    const a = auth.get();
    if (!a) toLogin();
    return a;
  }

  const DEMO_STATE_KEY = "adminDemoState.v2"; // 시연 데이터 모양이 바뀌면 숫자를 올려 옛 탭 상태를 버린다

  function photoSvg(label, fill) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${fill}"/><text x="320" y="188" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#1e5b3d">${label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString();
  }

  function demoItems() {
    return [
      {
        id: "fi-review",
        status: "REVIEW",
        category: null,
        title: null,
        building: { id: 9, name: "혜인관" },
        floor: 1,
        storageType: "HANDED_OVER",
        storagePlace: { id: 1, name: "교무처" },
        foundAt: hoursAgo(3),
        isSeed: true,
        claimLockedAt: null,
        color: null,
        brand: null,
        features: [],
        description: null,
        hiddenTrait: "분석이 끝나지 않아 숨은 특징이 아직 없어요.",
        isSensitive: false,
        originalImageUrl: photoSvg("원본 · 하얀 이어폰", "#efe8dc"),
        publicImageUrl: photoSvg("공개본 · 가림", "#e7e1d4"),
        thumbnailUrl: photoSvg("블러본", "#d5cbbd"),
        expiresAt: null,
        attempts: [],
        reveals: [],
        pickups: [],
      },
      {
        id: "fi-locked",
        status: "REGISTERED",
        category: "UMBRELLA",
        title: "검정 접이식 우산",
        building: { id: 2, name: "유담관" },
        floor: 2,
        storageType: "HANDED_OVER",
        storagePlace: { id: 1, name: "교무처" },
        foundAt: hoursAgo(30),
        isSeed: true,
        claimLockedAt: hoursAgo(1),
        color: "BLACK",
        brand: null,
        features: [{ key: "pattern", value: "손잡이에 체크 리본" }],
        description: "접이식이고 손잡이 리본이 있어요.",
        hiddenTrait: "우산 끝 캡이 한쪽만 빠져 있어요.",
        isSensitive: false,
        originalImageUrl: photoSvg("원본 · 검정 우산", "#efe8dc"),
        publicImageUrl: photoSvg("공개본 · 우산", "#e7e1d4"),
        thumbnailUrl: photoSvg("블러본", "#d5cbbd"),
        expiresAt: null,
        attempts: [
          { emailMasked: "st****@example.invalid", result: "FAIL", answerCorrect: false, createdAt: hoursAgo(5) },
          { emailMasked: "ab***@example.invalid", result: "FAIL", answerCorrect: false, createdAt: hoursAgo(2) },
        ],
        reveals: [],
        pickups: [],
      },
      {
        id: "fi-revealed",
        status: "REVEALED",
        category: "WALLET",
        subCategory: "BIFOLD_WALLET",
        title: "갈색 반지갑",
        building: { id: 1, name: "본관" },
        floor: 1,
        // 수령 QR은 보관처에 맡긴 물건에만 발급된다 → 알림과 맞게 교무처 보관 (10/30 평가)
        storageType: "HANDED_OVER",
        storagePlace: { id: 1, name: "교무처" },
        foundAt: hoursAgo(8),
        isSeed: true,
        claimLockedAt: null,
        color: "BROWN",
        brand: null,
        features: [{ key: "sticker", value: "안쪽에 초록 스티커" }],
        description: "반지갑이고 모서리가 닳았어요.",
        hiddenTrait: "지폐칸에 도서관 대출 영수증이 접혀 있어요.",
        isSensitive: false,
        originalImageUrl: photoSvg("원본 · 갈색 지갑", "#efe8dc"),
        publicImageUrl: photoSvg("공개본 · 지갑", "#e7e1d4"),
        thumbnailUrl: photoSvg("블러본", "#d5cbbd"),
        expiresAt: null,
        // "서로 다른 계정이 열람" 알림과 맞게 두 계정이 통과·열람했다
        attempts: [
          { emailMasked: "ab***@example.invalid", result: "PASS", answerCorrect: true, createdAt: hoursAgo(3) },
          { emailMasked: "st****@example.invalid", result: "PASS", answerCorrect: true, createdAt: hoursAgo(1) },
        ],
        reveals: [
          { emailMasked: "ab***@example.invalid", revealedAt: hoursAgo(3) },
          { emailMasked: "st****@example.invalid", revealedAt: hoursAgo(1) },
        ],
        pickups: [
          {
            id: "pk_demo",
            emailMasked: "st****@example.invalid",
            method: "CENTER_QR",
            status: "ISSUED",
            completedAt: null,
            createdAt: hoursAgo(1),
            processedByEmailMasked: null,
            verificationNote: null,
          },
        ],
      },
      {
        id: "fi-claimed",
        status: "CLAIMED",
        category: "BAG",
        title: "남색 백팩",
        building: { id: 8, name: "청운관" },
        floor: 3,
        storageType: "HANDED_OVER",
        storagePlace: { id: 1, name: "교무처" },
        foundAt: hoursAgo(80),
        isSeed: true,
        claimLockedAt: null,
        color: "BLUE_TEAL",
        brand: null,
        features: [],
        description: "수령이 끝나 사진과 비공개 정보를 지웠어요.",
        hiddenTrait: null,
        isSensitive: false,
        originalImageUrl: null,
        publicImageUrl: null,
        thumbnailUrl: null,
        expiresAt: null,
        attempts: [],
        reveals: [{ emailMasked: "cd***@example.invalid", revealedAt: hoursAgo(70) }],
        pickups: [
          {
            id: "pk_done",
            emailMasked: "cd***@example.invalid",
            method: "CENTER_QR",
            status: "COMPLETED",
            completedAt: hoursAgo(70),
            createdAt: hoursAgo(71),
            processedByEmailMasked: "ce***@example.invalid",
            verificationNote: null,
          },
        ],
      },
    ];
  }

  function demoNotifications() {
    return [
      {
        id: "nt-lock",
        type: "CLAIM_LOCKED",
        message: "검정 접이식 우산은 모든 계정을 합쳐 확인 실패가 10번이라 대면 확인만 받아요.",
        foundItemId: "fi-locked",
        lostReportId: null,
        readAt: null,
        createdAt: hoursAgo(1),
      },
      {
        id: "nt-pickup",
        type: "PICKUP_SCHEDULED",
        message: "갈색 반지갑 수령 예정: 확인을 통과한 학생이 수령 QR을 받았어요(24시간 유효).",
        foundItemId: "fi-revealed",
        lostReportId: null,
        readAt: null,
        createdAt: hoursAgo(1),
      },
      {
        id: "nt-reveal",
        type: "MULTI_REVEAL",
        message: "갈색 반지갑을 서로 다른 계정이 열람했어요. 수령 때 본인을 한 번 더 봐 주세요.",
        foundItemId: "fi-revealed",
        lostReportId: null,
        readAt: null,
        createdAt: hoursAgo(1),
      },
    ];
  }

  function loadDemoState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(DEMO_STATE_KEY) || "null");
      if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch (_) {}
    const fresh = { items: demoItems(), notifications: demoNotifications() };
    sessionStorage.setItem(DEMO_STATE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  function saveDemoState(state) {
    sessionStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
  }

  function startDemo() {
    if (!sessionStorage.getItem(DEMO_STATE_KEY)) {
      sessionStorage.setItem(
        DEMO_STATE_KEY,
        JSON.stringify({ items: demoItems(), notifications: demoNotifications() }),
      );
    }
    if (!auth.get()?.demo) {
      auth.set({
        accessToken: "demo",
        expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
        user: { id: "admin-demo", email: "demo-admin@example.invalid", role: "ADMIN" },
        storagePlace: { id: 1, name: "교무처" },
        demo: true,
      });
    }
    return auth.get();
  }

  function countsOf(items) {
    const counts = {};
    for (const item of items) counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }

  function demoCall(path, method, body) {
    const state = loadDemoState();
    const url = new URL(path, "http://admin.local");
    const itemId = url.pathname.match(/^\/admin\/found-items\/([^/]+)/)?.[1];

    if (url.pathname === "/admin/found-items" && method === "GET") {
      const status = url.searchParams.get("status");
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const filtered = state.items.filter((item) => !status || item.status === status);
      const start = (page - 1) * 20;
      return {
        items: filtered.slice(start, start + 20).map((item) => ({ ...item })),
        page,
        pageSize: 20,
        total: filtered.length,
        counts: countsOf(state.items),
      };
    }

    if (itemId && url.pathname.endsWith("/close") && method === "POST") {
      const item = state.items.find((row) => row.id === itemId);
      if (!item) throw new ApiError(404, { error: { code: "NOT_FOUND", message: "물건을 찾을 수 없어요." } });
      if (item.status === "CLAIMED") {
        throw new ApiError(409, { error: { code: "ALREADY_CLAIMED", message: "이미 수령된 물건이에요." } });
      }
      if (!["REGISTERED", "REVEALED", "REVIEW"].includes(item.status)) {
        throw new ApiError(409, { error: { code: "NOT_CLOSABLE", message: "보관 중인 물건만 끝낼 수 있어요." } });
      }
      const closedAt = new Date().toISOString();
      const purge = body?.reason === "MISREGISTERED";
      const next = {
        ...item,
        status: "EXPIRED",
        closedAt,
        closedReason: body?.reason === "MISREGISTERED" ? "MISREGISTERED" : "DISPOSED",
        closedByEmailMasked: "ce***@example.invalid",
        ...(purge ? { originalImageUrl: null, publicImageUrl: null, thumbnailUrl: null, hiddenTrait: null } : {}),
        pickups: item.pickups.map((p) => (p.status === "ISSUED" ? { ...p, status: "EXPIRED" } : p)),
      };
      saveDemoState({ ...state, items: state.items.map((row) => (row.id === itemId ? next : row)) });
      return { ...next };
    }

    if (itemId && url.pathname.endsWith("/in-person-pickup") && method === "POST") {
      const note = String(body?.verificationNote || "").trim();
      if (note.length < 1 || note.length > VERIFICATION_NOTE_MAX) {
        throw new ApiError(400, { error: { code: "VALIDATION_ERROR", message: "확인 메모는 1자에서 200자까지예요." } });
      }
      const item = state.items.find((row) => row.id === itemId);
      if (!item) throw new ApiError(404, { error: { code: "NOT_FOUND", message: "물건을 찾을 수 없어요." } });
      if (!item.claimLockedAt || !["REGISTERED", "REVEALED"].includes(item.status)) {
        throw new ApiError(409, {
          error: { code: "NOT_IN_PERSON_ITEM", message: "대면 확인으로 수령할 물건이 아니에요." },
        });
      }
      if (item.status === "CLAIMED") {
        throw new ApiError(409, { error: { code: "ALREADY_CLAIMED", message: "이미 돌려준 물건이에요." } });
      }
      const completedAt = new Date().toISOString();
      const nextItems = state.items.map((row) =>
        row.id === itemId
          ? {
              ...row,
              status: "CLAIMED",
              originalImageUrl: null,
              publicImageUrl: null,
              thumbnailUrl: null,
              hiddenTrait: null,
              pickups: [
                ...row.pickups,
                {
                  id: `pk_person_${Date.now()}`,
                  emailMasked: null,
                  method: "IN_PERSON",
                  status: "COMPLETED",
                  completedAt,
                  createdAt: completedAt,
                  processedByEmailMasked: "ce***@example.invalid",
                  verificationNote: note,
                },
              ],
            }
          : row,
      );
      saveDemoState({ ...state, items: nextItems });
      return { pickupId: `pk_person_${Date.now()}`, method: "IN_PERSON", status: "COMPLETED", completedAt };
    }

    if (itemId && method === "GET") {
      const item = state.items.find((row) => row.id === decodeURIComponent(itemId));
      if (!item) throw new ApiError(404, { error: { code: "NOT_FOUND", message: "물건을 찾을 수 없어요." } });
      return { ...item };
    }

    if (itemId && method === "PATCH") {
      const item = state.items.find((row) => row.id === decodeURIComponent(itemId));
      if (!item) throw new ApiError(404, { error: { code: "NOT_FOUND", message: "물건을 찾을 수 없어요." } });
      const patch = { ...body };
      if (patch.status === "REGISTERED" && item.status !== "REVIEW") delete patch.status;
      const nextItems = state.items.map((row) => (row.id === item.id ? { ...row, ...patch } : row));
      saveDemoState({ ...state, items: nextItems });
      return nextItems.find((row) => row.id === item.id);
    }

    if (url.pathname === "/admin/pickups/scan" && method === "POST") {
      const token = String(body?.qrToken || "");
      if (token === "pk_expired")
        throw new ApiError(410, { error: { code: "QR_EXPIRED", message: "만료된 QR이에요." } });
      if (token === "pk_claimed")
        throw new ApiError(409, { error: { code: "ALREADY_CLAIMED", message: "이미 돌려준 물건이에요." } });
      if (token === "pk_other")
        throw new ApiError(403, { error: { code: "FORBIDDEN", message: "다른 보관처 물건이에요." } });
      if (token !== "pk_demo") throw new ApiError(404, { error: { code: "NOT_FOUND", message: "없는 QR이에요." } });
      const item = state.items.find((row) => row.id === "fi-revealed");
      if (!item || item.status === "CLAIMED") {
        throw new ApiError(409, { error: { code: "ALREADY_CLAIMED", message: "이미 돌려준 물건이에요." } });
      }
      return {
        pickupId: "pk_demo",
        foundItem: {
          id: item.id,
          category: item.category,
          subCategory: item.subCategory,
          building: item.building?.name || null,
          imageUrl: item.originalImageUrl,
        },
        claimant: { emailMasked: "st****@example.invalid" },
        expiresAt: new Date(Date.now() + 20 * 3600 * 1000).toISOString(),
      };
    }

    if (url.pathname === "/admin/pickups/pk_demo/complete" && method === "POST") {
      const item = state.items.find((row) => row.id === "fi-revealed");
      if (!item || item.status === "CLAIMED") {
        throw new ApiError(409, { error: { code: "ALREADY_CLAIMED", message: "이미 돌려준 물건이에요." } });
      }
      const completedAt = new Date().toISOString();
      const nextItems = state.items.map((row) =>
        row.id === "fi-revealed"
          ? {
              ...row,
              status: "CLAIMED",
              originalImageUrl: null,
              publicImageUrl: null,
              thumbnailUrl: null,
              hiddenTrait: null,
            }
          : row,
      );
      saveDemoState({ ...state, items: nextItems });
      return { pickupId: "pk_demo", status: "COMPLETED", completedAt };
    }

    if (url.pathname === "/admin/stats/hotspots" && method === "GET") {
      // 시연 데이터도 서버가 실제 통계와 같은 집계 코드로 계산한다 (학생 데이터 없음)
      return call(`/demo/admin/stats/hotspots${url.search}`, { token: false });
    }

    if (url.pathname === "/notifications" && method === "GET") {
      const unreadCount = state.notifications.filter((item) => !item.readAt).length;
      return { notifications: state.notifications.map((item) => ({ ...item })), unreadCount };
    }

    if (url.pathname === "/notifications/read-all" && method === "PATCH") {
      const now = new Date().toISOString();
      saveDemoState({
        ...state,
        notifications: state.notifications.map((item) => ({ ...item, readAt: item.readAt || now })),
      });
      return null;
    }

    const noteId = url.pathname.match(/^\/notifications\/([^/]+)\/read$/)?.[1];
    if (noteId && method === "PATCH") {
      const now = new Date().toISOString();
      saveDemoState({
        ...state,
        notifications: state.notifications.map((item) =>
          item.id === decodeURIComponent(noteId) ? { ...item, readAt: item.readAt || now } : item,
        ),
      });
      return null;
    }

    throw new ApiError(404, { error: { code: "NOT_FOUND", message: "시연에서 아직 없는 요청이에요." } });
  }

  // 연결 끊김 안내(/offline-notice.js). 그 파일이 늦게 받아져도 놓치지 않게, 그 전의 알림은 배열에 쌓아 둔다
  function reportNet(ok, isGet) {
    if (!window.OfflineNotice) window.OfflineNotice = [];
    const n = window.OfflineNotice;
    if (Array.isArray(n)) n.push([ok, isGet]);
    else n.report(ok, isGet);
  }
  if (!document.querySelector('script[src="/offline-notice.js"]')) {
    const s = document.createElement("script");
    s.src = "/offline-notice.js";
    document.head.appendChild(s);
  }

  async function call(path, { method = "GET", body, token = true } = {}) {
    if (auth.get()?.demo && token) return demoCall(path, method, body);
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) {
      const a = auth.get();
      if (!a) {
        toLogin();
        throw new ApiError(401, { error: { code: "UNAUTHORIZED", message: "다시 로그인해 주세요." } });
      }
      headers.Authorization = `Bearer ${a.accessToken}`;
    }
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_) {
      reportNet(false, method === "GET");
      throw new ApiError(0, {
        error: { code: "NETWORK", message: "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." },
      });
    }
    reportNet(true, method === "GET");
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (res.status === 401 && token) {
      toLogin();
      throw new ApiError(401, data);
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  /** 서버 오류를 화면 문장으로. 칸별 오류가 있으면 함께 */
  function errorText(err) {
    if (!(err instanceof ApiError)) return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
    const parts = [err.message];
    for (const d of err.details || []) if (d?.message && d.message !== err.message) parts.push(d.message);
    return parts.join(" · ");
  }

  /** note.danger 한 줄로 오류를 보인다. 비우려면 err 없이 부른다 */
  function showError(el, err) {
    if (!el) return;
    el.hidden = !err;
    el.textContent = err ? (typeof err === "string" ? err : errorText(err)) : "";
  }

  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  /** 10월 23일(금) 14:10 (한국 시간) */
  function formatTime(iso, withTime = true) {
    if (!iso) return "";
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(iso))
        .map((x) => [x.type, x.value]),
    );
    const dow = DAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday)];
    const day = `${p.month}월 ${p.day}일(${dow})`;
    return withTime ? `${day} ${p.hour}:${p.minute}` : day;
  }

  /** 한국 날짜 YYYY-MM-DD (오늘에서 offset일) */
  function seoulDate(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
  }

  /** 요소 만들기. 글자는 textContent로만 넣는다(서버 글자를 HTML로 넣지 않는다) */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /** 보이기·숨기기. palette.css의 display 규칙(.btn, .chip, .choice…)이 hidden 속성을 이기므로 style로 바꾼다 */
  function show(node, on) {
    if (node) node.style.display = on ? "" : "none";
  }

  /** 상태 칩 */
  function statusChip(status) {
    const s = STATUS[status] || { label: status, chip: "chip" };
    // 끝난 상태는 팔레트의 종이색·흐린 글자로 (새 색 없이)
    return el("span", { class: s.chip, style: s.mute ? MUTE_CHIP : null, text: s.label });
  }

  /** 주운 곳 글자: "혜인관 3층" / 모르면 "주운 곳 모름" */
  function placeText(item) {
    if (!item.building) return "주운 곳 모름";
    return [item.building.name, floorLabel(item.floor)].filter(Boolean).join(" ");
  }

  /** 목록·상세 제목: AI 제목 → 종류 이름 → 확인 전 */
  function itemTitle(item) {
    return item.title || itemLabel(item.category, item.subCategory) || "종류 확인 전 물건";
  }

  window.AdminApi = {
    API_BASE,
    CATEGORY_LABELS,
    SUB_CATEGORIES,
    SUB_CATEGORY_LABELS,
    COLOR_LABELS,
    FEATURE_KEY_LABELS,
    MAX_FEATURES,
    VERIFICATION_NOTE_MAX,
    STATUS,
    STATUS_ORDER,
    STORAGE_LABELS,
    MATCH_RESULT_LABELS,
    PICKUP_METHOD_LABELS,
    PICKUP_STATUS_LABELS,
    NOTIFICATION_LABELS,
    NOTIFICATION_KIND,
    CLOSED_REASON_LABELS,
    floorLabel,
    ApiError,
    auth,
    requireLogin,
    toLogin,
    itemLabel,
    itemTitle,
    placeText,
    statusChip,
    show,
    errorText,
    showError,
    formatTime,
    seoulDate,
    el,

    /** POST /admin/auth/login → { accessToken, expiresAt, user, storagePlace } 를 저장한다 */
    async login(email, password) {
      const r = await call("/admin/auth/login", { method: "POST", body: { email, password }, token: false });
      auth.set(r);
      return r;
    },
    logout() {
      auth.clear();
      try {
        sessionStorage.removeItem(DEMO_STATE_KEY);
      } catch (_) {}
      location.href = "login.html";
    },
    startDemo() {
      const session = startDemo();
      return session;
    },

    /** GET /admin/found-items?status=&page= */
    listItems: ({ status, page = 1 } = {}) => {
      const q = new URLSearchParams({ page: String(page) });
      if (status) q.set("status", status);
      return call(`/admin/found-items?${q}`);
    },
    getItem: (id) => call(`/admin/found-items/${encodeURIComponent(id)}`),
    /** PATCH /admin/found-items/:id. 바꾼 칸만 보낸다 */
    updateItem: (id, body) => call(`/admin/found-items/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    /** POST /admin/found-items/:id/close: 보관 종료. reason = DISPOSED | MISREGISTERED */
    closeItem: (id, reason) =>
      call(`/admin/found-items/${encodeURIComponent(id)}/close`, { method: "POST", body: { reason } }),
    inPersonPickup: (id, verificationNote) =>
      call(`/admin/found-items/${encodeURIComponent(id)}/in-person-pickup`, {
        method: "POST",
        body: { verificationNote },
      }),

    scanPickup: (qrToken) => call("/admin/pickups/scan", { method: "POST", body: { qrToken } }),
    completePickup: (pickupId) => call(`/admin/pickups/${encodeURIComponent(pickupId)}/complete`, { method: "POST" }),

    /** GET /admin/stats/hotspots?from=&to= (한국 날짜) */
    hotspots: ({ from, to } = {}) => {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const s = q.toString();
      return call(`/admin/stats/hotspots${s ? `?${s}` : ""}`);
    },

    notifications: () => call("/notifications"),
    markRead: (id) => call(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
    markAllRead: () => call("/notifications/read-all", { method: "PATCH" }),
  };

  try {
    if (new URLSearchParams(location.search).get("demo") === "1") startDemo();
  } catch (_) {}
})();
