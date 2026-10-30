// 잃어버린 사람 화면 ↔ 백엔드 연결 (window.LostApi).
// 찾은 사람 쪽 found/api.js와 같은 모양으로 만든다. 화면에서는 이렇게 쓴다:
//   <script src="api.js"></script>
//   const res = await LostApi.createReport({ category, lostFrom, lostTo, buildingId, description });
//   try { ... } catch (e) { alert(LostApi.friendlyMessage(e)); }
//
// API 주소 (배포에서도 안전하게):
//   1) 개발 주소에서만 ?api=https://.../api/v1 로 한 번 주면 이 탭(sessionStorage)에서 기억한다 (found/api.js와 같은 키 "apiBase")
//   2) 포트가 붙은 주소(개발용 정적 서버: 5500, 8000 등)로 열었으면 같은 호스트의 4000 포트
//      (백엔드 기본 PORT, found/api.js와 같음. 휴대폰에서 PC IP로 열어도 맞게)
//   3) 포트 없는 주소(배포, https)는 같은 출처의 /api/v1
(() => {
  // ── API 주소 ──────────────────────────────────────────────
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
  const DEV_API_PORT = "4000";
  const defaultBase =
    location.port && location.port !== DEV_API_PORT
      ? `${location.protocol}//${location.hostname}:${DEV_API_PORT}/api/v1`
      : `${location.origin}/api/v1`;
  const API_BASE = (saved || defaultBase).replace(/\/+$/, "");

  // ── 공유 상수 (packages/shared 그대로 옮김. 바뀌면 같이 고친다) ──────────
  /** packages/shared/src/api/consent.ts의 CONSENT_VERSION */
  const CONSENT_VERSION = "2026-10-12";
  /** packages/shared/src/api/consent.ts의 CONSENT_TEXTS (동의 화면 문구) */
  const CONSENT_TEXTS = {
    email:
      "가입한 학교 이메일을 저장해요. 물건을 확인하고 가져간 계정을 특정하는 데 쓰고, 수령 30일 뒤 관련 기록을 지워요.",
    location:
      "사진의 위치 정보나 지금 위치로 가장 가까운 건물을 골라요. 좌표는 휴대폰 안에서 건물로만 바꾸고 서버에 보내거나 저장하지 않아요.",
    externalAi:
      "사진과 설명을 Google Gemini(해외)로 보내 물건의 종류·색·특징을 읽어요. 학습에 쓰이지 않는 유료 구간을 쓰고, 개인정보가 보이는 부분은 가려서 보여 줘요.",
  };
  /** 개발용 캡차 토큰. 백엔드가 CAPTCHA_MODE=off일 때만 통과한다 */
  const DEV_CAPTCHA_TOKEN = "dev-pass";
  /** packages/shared/src/api/lost-reports.ts의 DESCRIPTION_MIN/MAX */
  const DESCRIPTION_MIN = 5;
  const DESCRIPTION_MAX = 500;
  /** packages/shared/src/api/claims.ts AnswerRequest 최대 길이 */
  const ANSWER_MAX = 50;
  /** 인증 코드: 서버 기준 5분 유효, 1분에 한 번 다시 받기, 5번 틀리면 버림 (backend/src/services/auth.ts) */
  const CODE_TTL_SECONDS = 300;
  const CODE_RESEND_SECONDS = 60;
  const CODE_MAX_WRONG = 5;

  /** packages/shared/src/enums.ts의 CATEGORY_LABELS (순서도 Category enum 그대로) */
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
  const CATEGORIES = Object.keys(CATEGORY_LABELS);

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

  /** packages/shared/src/enums.ts의 SUB_CATEGORIES (큰 종류별 세부 종류). 신고 화면 종류 선택에 세부 종류도 보여 준다 */
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

  /** packages/shared/src/enums.ts의 COLOR_LABELS (상세 화면의 color) */
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

  /** packages/shared/src/api/lost-reports.ts의 CANDIDATE_REASON_LABELS (후보 카드 칩) */
  const REASON_LABELS = {
    SAME_CATEGORY: "같은 종류",
    RELATED_CATEGORY: "연관 종류",
    SAME_BUILDING: "같은 건물",
    FOUND_SOON_AFTER: "잃어버린 뒤 2시간 안에 습득",
  };

  /** 신고 상태 (ReportStatus) */
  const REPORT_STATUS_LABELS = { OPEN: "진행 중", RESOLVED: "찾음", CLOSED: "종료" };
  /** 보관 방식 (StorageType) */
  const STORAGE_TYPE_LABELS = { IN_PLACE: "그 자리에 둠", HANDED_OVER: "보관처에 맡김" };

  /**
   * 신고 화면에서 사람이 적은 물건 이름("에어팟", "검정 지갑")으로 종류를 미리 고른다. 못 고르면 null.
   * 먼저 맞는 낱말이 이기므로 겹치는 낱말은 긴 쪽을 앞에 둔다 (이어폰 > 폰, 교통카드 > 카드).
   * 서버로 보내기 전에 사람이 종류 선택칸에서 고칠 수 있다.
   */
  const CATEGORY_WORDS = [
    ["이어폰", "EARPHONE"],
    ["에어팟", "EARPHONE"],
    ["버즈", "EARPHONE"],
    ["헤드폰", "EARPHONE"],
    ["스마트워치", "SMARTWATCH"],
    ["애플워치", "SMARTWATCH"],
    ["워치", "SMARTWATCH"],
    ["학생증", "ID_CARD"],
    ["신분증", "ID_CARD"],
    ["면허증", "DRIVER_LICENSE"],
    ["교통카드", "TRANSIT_CARD"],
    ["체크카드", "PAYMENT_CARD"],
    ["신용카드", "PAYMENT_CARD"],
    ["카드", "OTHER_CARD"],
    ["휴대폰", "PHONE"],
    ["핸드폰", "PHONE"],
    ["아이폰", "PHONE"],
    ["갤럭시", "PHONE"],
    ["폰", "PHONE"],
    ["태블릿", "TABLET"],
    ["아이패드", "TABLET"],
    ["노트북", "LAPTOP"],
    ["맥북", "LAPTOP"],
    ["충전기", "CHARGER"],
    ["보조배터리", "CHARGER"],
    ["마우스", "CHARGER"],
    ["키보드", "CHARGER"],
    ["케이블", "CHARGER"],
    ["지갑", "WALLET"],
    ["가방", "BAG"],
    ["백팩", "BAG"],
    ["파우치", "BAG"],
    ["모자", "HAT"],
    ["패딩", "CLOTHING"],
    ["후드", "CLOTHING"],
    ["옷", "CLOTHING"],
    ["목도리", "CLOTHING"],
    ["교재", "BOOK"],
    ["전공책", "BOOK"],
    ["책", "BOOK"],
    ["선글라스", "GLASSES"],
    ["안경", "GLASSES"],
    ["시계", "ACCESSORY"],
    ["반지", "ACCESSORY"],
    ["목걸이", "ACCESSORY"],
    ["현금", "CASH"],
    ["우산", "UMBRELLA"],
    ["텀블러", "TUMBLER"],
    ["물병", "TUMBLER"],
    ["열쇠", "KEY"],
    ["키링", "KEY"],
    ["필통", "STATIONERY"],
    ["펜", "STATIONERY"],
  ];
  const guessCategory = (text) => {
    const t = String(text || "").replace(/\s+/g, "");
    if (!t) return null;
    return CATEGORY_WORDS.find(([w]) => t.includes(w))?.[1] || null;
  };

  /** 물건 이름에 세부 종류 이름("마우스", "보조배터리")이 들어 있으면 그 세부 종류. 그 큰 종류 안에서만 찾는다 */
  const guessSubCategory = (category, text) => {
    const t = String(text || "").replace(/\s+/g, "");
    if (!t) return null;
    return (
      (SUB_CATEGORIES[category] || []).find((sub) =>
        SUB_CATEGORY_LABELS[sub].split("·").some((w) => w && t.includes(w.replace(/\s+/g, ""))),
      ) || null
    );
  };

  /**
   * AI가 신고 설명에서 읽은 것을 한 줄로 ("흰색 · 무선 이어폰 · 곰돌이 스티커").
   * 신고자 본인이 적은 내용에서 나온 값만 쓴다. 없으면 "".
   */
  const aiReadSummary = (aiRead) => {
    if (!aiRead) return "";
    const parts = [];
    if (aiRead.color && COLOR_LABELS[aiRead.color]) parts.push(COLOR_LABELS[aiRead.color]);
    if (aiRead.brand) parts.push(aiRead.brand);
    parts.push(itemLabel(aiRead.category, aiRead.subCategory));
    for (const f of aiRead.features || []) parts.push(f.value);
    return parts.filter(Boolean).join(" · ");
  };

  /**
   * 확인 통과 화면의 "AI가 한 일" 한 줄. 신고자 본인이 적은 표현만 쓴다(숨은 특징 원문은 쓰지 않는다).
   * claim: 마지막 판정 응답(KEYS.claim), aiRead: KEYS.aiRead, itemId: 지금 보는 물건(다른 물건의 판정이면 안 보인다). 근거가 없으면 "".
   */
  const passExplanation = (claim, aiRead, itemId) => {
    if (!claim || claim.result !== "PASS") return "";
    if (itemId && claim.foundItemId && claim.foundItemId !== itemId) return "";
    const fields = claim.matchedFields;
    if (!Array.isArray(fields)) return "AI가 만든 확인 질문을 모두 맞혔어요.";
    const said = [];
    for (const f of fields) {
      if (f === "color" && aiRead?.color && COLOR_LABELS[aiRead.color]) said.push(COLOR_LABELS[aiRead.color]);
      else if (f === "brand" && aiRead?.brand) said.push(aiRead.brand);
      else if (f.startsWith("feature:")) {
        const key = f.slice("feature:".length);
        const hit = (aiRead?.features || []).find((x) => x.key === key);
        if (hit) said.push(hit.value);
      }
    }
    if (!said.length) return "AI가 설명과 등록된 특징을 비교해 같은 물건으로 봤어요.";
    return `AI가 설명의 '${said.join("', '")}'을(를) 등록된 특징과 같은 뜻으로 봤어요.`;
  };

  /** 화면 이름: 세부 종류가 있으면 그 이름, 없으면 큰 종류 이름 (shared itemLabel) */
  const itemLabel = (category, sub) => (sub && SUB_CATEGORY_LABELS[sub]) || CATEGORY_LABELS[category] || "";

  // ── 오류 ─────────────────────────────────────────────────
  /** 오류 코드별 화면 문구. 서버 message보다 짧고 다음 행동을 알려 준다 */
  const ERROR_MESSAGES = {
    NETWORK: "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
    VALIDATION_ERROR: "입력한 내용을 다시 확인해 주세요.",
    INVALID_EMAIL_DOMAIN: "서경대 학교 이메일만 가입할 수 있어요.",
    INVALID_CODE: "인증 코드가 맞지 않거나 시간이 지났어요. 다시 받아 주세요.",
    CAPTCHA_FAILED: "사람인지 확인하지 못했어요. 다시 시도해 주세요.",
    UNAUTHORIZED: "로그인이 필요해요. 다시 로그인해 주세요.",
    FORBIDDEN: "이 물건은 볼 수 없어요. 확인을 통과한 물건만 볼 수 있어요.",
    NOT_FOUND: "찾을 수 없어요. 이미 지워졌거나 기한이 지났어요.",
    MATCH_LOCKED: "이 물건은 확인 기회를 모두 썼어요. 학생증을 가지고 교무처(혜인관 1층, 평일 9~18시)에 문의해 주세요.",
    IN_PERSON_REQUIRED: "이 물건은 온라인 확인이 닫혔어요. 학생증을 가지고 보관처에서 직접 확인해 주세요.",
    ALREADY_CLAIMED: "이미 주인이 찾아간 물건이에요.",
    ALREADY_ANSWERED: "이미 답한 질문이에요. 후보 목록에서 다시 확인해 주세요.",
    INVALID_STORAGE_TYPE: "이 물건은 이 방법으로 받을 수 없어요.",
    QR_EXPIRED: "QR 시간이 지났어요. 다시 받아 주세요.",
    RATE_LIMITED: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    INTERNAL_ERROR: "서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    AI_UNAVAILABLE: "지금은 설명을 읽지 못했어요. 잠시 후 다시 시도해 주세요. (저장되지 않았어요)",
  };

  class ApiError extends Error {
    /**
     * @param {number} status HTTP 상태 (연결 실패는 0)
     * @param {{error?: {code?: string, message?: string, details?: {path: string, message: string}[]}} | null} body
     */
    constructor(status, body) {
      super(body?.error?.message || `요청이 실패했어요 (${status})`);
      this.name = "ApiError";
      /** @type {number} */
      this.status = status;
      /** @type {string} 예: MATCH_LOCKED. 모르면 UNKNOWN, 연결 실패는 NETWORK */
      this.code = body?.error?.code || "UNKNOWN";
      /** @type {{path: string, message: string}[]} VALIDATION_ERROR일 때 필드별 오류 */
      this.details = body?.error?.details || [];
    }
  }

  /**
   * 화면에 띄울 문구. VALIDATION_ERROR는 첫 필드 오류(서버가 준 한국어)를, 그 밖에는 코드별 문구를 쓴다.
   * RATE_LIMITED는 서버 문구가 더 구체적이라(예: "체험 계정을 너무 많이 만들었어요") 서버 문구를 쓴다.
   * @param {unknown} err
   * @returns {string}
   */
  /** 확인 결과 화면에 주소로 바로 들어왔거나 볼 수 없는 물건일 때 */
  function itemBlockedMessage(err) {
    if (err instanceof ApiError && ["VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN"].includes(err.code))
      return "확인 질문을 통과한 물건만 볼 수 있어요.";
    return friendlyMessage(err);
  }
  function friendlyMessage(err) {
    if (!(err instanceof ApiError)) return "알 수 없는 문제가 생겼어요. 다시 시도해 주세요.";
    if (err.code === "VALIDATION_ERROR")
      return err.details[0]?.message || err.message || ERROR_MESSAGES.VALIDATION_ERROR;
    if (err.code === "RATE_LIMITED" && err.message) return err.message;
    return ERROR_MESSAGES[err.code] || err.message;
  }

  // ── 저장소 (sessionStorage, 탭을 닫으면 지워진다) ─────────────────
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
        if (value === null || value === undefined) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify(value));
      } catch (_) {}
    },
  };

  /** 화면 사이에 넘기는 값의 저장 키. 화면끼리 같은 이름을 쓰도록 모아 둔다 */
  const KEYS = {
    auth: "lost.auth", // { accessToken, expiresAt, user: { id, email, role } }
    signupEmail: "lost.signupEmail", // 회원가입 → 인증 코드 화면
    codeSent: "lost.codeSent", // { email, at, wrong } 마지막으로 인증 코드를 보낸 시각과 그 코드로 틀린 횟수
    signupPassword: "lost.signupPassword", // 회원가입 → 동의 화면. 이 탭에만 10분까지 두고, 가입·흐름 이탈 때 지운다
    verification: "lost.verification", // { verificationToken, expiresAt } 인증 코드 → 동의 화면
    reportDraft: "lost.reportDraft", // 신고 화면 ↔ 건물 화면 왕복
    reportId: "lost.reportId", // 지금 보고 있는 신고
    aiRead: "lost.aiRead", // 그 신고 설명에서 AI가 읽은 것 (ReportAiRead). 후보·통과 화면의 "AI가 한 일"
    candidate: "lost.candidate", // 확인하려는 후보 한 개 (Candidate)
    claim: "lost.claim", // 마지막 판정 응답 (ClaimResponse/AnswerResponse)
    foundItemId: "lost.foundItemId", // 통과한 물건
    pickup: "lost.pickup", // 마지막 수령 응답 (PickupQrResponse/SelfPickupResponse)
  };

  // ── 가입 중 비밀번호 ───────────────────────────────────────
  // 회원가입 화면에서 받은 비밀번호를 동의 화면의 가입 요청까지 넘겨야 해서 이 탭(sessionStorage)에 잠깐 둔다.
  // 오래 남지 않게 10분이 지나면 버리고, 가입 흐름(회원가입·인증 코드·동의) 밖 화면을 열면 바로 지운다.
  const SIGNUP_PASSWORD_TTL_MS = 10 * 60_000;
  const holdSignupPassword = (password) => store.set(KEYS.signupPassword, { password, at: Date.now() });
  const dropSignupPassword = () => store.set(KEYS.signupPassword, null);
  function heldSignupPassword() {
    const v = store.get(KEYS.signupPassword);
    if (!v?.password || Date.now() - v.at > SIGNUP_PASSWORD_TTL_MS) {
      dropSignupPassword();
      return null;
    }
    return v.password;
  }
  if (!/\/(signup|code|consent-mail)\.html$/.test(location.pathname)) dropSignupPassword();

  // ── 로그인 상태 ───────────────────────────────────────────
  /**
   * @typedef {{ accessToken: string, expiresAt: string, user: { id: string, email: string, role: "USER"|"DEMO"|"ADMIN" } }} Session
   */
  /** @returns {Session | null} 만료된 토큰은 지우고 null */
  function session() {
    const s = store.get(KEYS.auth);
    if (!s?.accessToken) return null;
    if (s.expiresAt && Date.parse(s.expiresAt) <= Date.now()) {
      store.set(KEYS.auth, null);
      return null;
    }
    return s;
  }
  const isLoggedIn = () => session() !== null;
  /** 체험 계정이면 true (홈의 "체험 모드" 띠, 수령이 바로 완료되는 것 안내) */
  const isDemo = () => session()?.user?.role === "DEMO";
  /** 화면 맨 위에서 부른다: 로그인하지 않았으면 로그인 화면으로 보낸다 */
  function requireLogin(loginPage = "login.html") {
    if (isLoggedIn()) return true;
    location.replace(loginPage);
    return false;
  }
  /** 로그아웃: 토큰과 흐름 값을 지운다 (서버 호출 없음) */
  function logout() {
    for (const k of Object.values(KEYS)) store.set(k, null);
  }

  // ── 캡차 ─────────────────────────────────────────────────
  // Turnstile을 붙이면 위젯 토큰을 돌려주는 함수를 끼운다. 함수는 action 이름을 받는다.
  // 서버(PR #47)는 토큰의 action을 확인한다: 인증 코드 요청 "email-code", 체험 로그인 "demo-login"
  // (습득물 등록은 found 쪽 "found-analyze"). 위젯을 그릴 때 같은 action을 넣어야 통과한다. 예:
  //   LostApi.setCaptchaProvider((action) => turnstile.getResponse(widgetIdByAction[action]));
  // 함수는 문자열 또는 Promise<문자열>을 돌려준다. 기본은 개발용 "dev-pass" (CAPTCHA_MODE=off에서만 통과).
  const CAPTCHA_ACTIONS = { emailCode: "email-code", demoLogin: "demo-login" };
  let captchaProvider = () => DEV_CAPTCHA_TOKEN;
  /** @param {(action: string) => string | Promise<string>} fn */
  function setCaptchaProvider(fn) {
    captchaProvider = typeof fn === "function" ? fn : () => DEV_CAPTCHA_TOKEN;
  }
  /**
   * 화면에 Turnstile 위젯을 그리고 그 action의 요청에 토큰을 붙인다. ../found/captcha.js를 먼저 불러야 한다.
   * 서버가 off면 위젯 없이 개발용 토큰을 보낸다. 토큰은 한 번만 쓸 수 있어 보낸 뒤 위젯을 reset해 새로 받는다.
   * @returns {Promise<{ mode: string, reset(): void } | null>} 위젯을 못 그리면 null (화면이 안내하고 다시 부른다)
   */
  async function useCaptcha(container, action, { onError } = {}) {
    if (!window.FoundCaptcha) return null;
    let cap;
    try {
      cap = await window.FoundCaptcha.mount(container, {
        action,
        getConfig: () => window.LostApi.config(),
        persist: false,
        onError,
      });
    } catch (_) {
      return null;
    }
    if (cap.mode !== "turnstile") return cap;
    const previous = captchaProvider;
    setCaptchaProvider(async (a) => {
      if (a !== action) return previous(a);
      await cap.ready();
      const t = cap.token();
      cap.reset();
      return t;
    });
    return cap;
  }

  async function captchaHeader(action) {
    const token = await captchaProvider(action);
    return { "X-Captcha-Token": token || "" };
  }

  // ── 요청 기록 (_tester.html) ───────────────────────────────
  const SECRET_KEYS = new Set(["accessToken", "verificationToken", "confirmToken", "qrToken", "password"]);
  /** 비밀 값은 앞 4글자만 남긴다. 서명 URL은 서명을 가린다 */
  function mask(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(
      JSON.stringify(value, (k, v) => {
        if (typeof v !== "string") return v;
        if (k === "code" && /^\d{6}$/.test(v)) return "******";
        if (SECRET_KEYS.has(k)) return k === "password" ? "********" : `${v.slice(0, 4)}…(${v.length})`;
        if (/sig=/.test(v)) return v.replace(/sig=[^&]+/, "sig=…");
        return v;
      }),
    );
  }

  /** 모바일 테스터(_tester.html) 안에서 열렸으면 요청 기록을 테스터로 보낸다 */
  function log(entry) {
    try {
      if (window.top !== window) window.top.postMessage({ type: "api-log", ...entry }, location.origin);
    } catch (_) {}
    for (const fn of listeners) {
      try {
        fn(entry);
      } catch (_) {}
    }
  }
  const listeners = [];
  /** 요청마다 { method, path, status, ms, body(가린 응답), request(가린 요청) }를 받는다 */
  const onLog = (fn) => listeners.push(fn);

  // ── 요청 ─────────────────────────────────────────────────
  /**
   * @param {string} path /api/v1 뒤 경로
   * @param {{ method?: string, body?: unknown, auth?: boolean, captcha?: string }} [opts] captcha: 캡차 action 이름
   */
  async function call(path, opts = {}) {
    const method = opts.method || "GET";
    const headers = {};
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.auth !== false) {
      const s = session();
      if (s) headers.Authorization = `Bearer ${s.accessToken}`;
    }
    if (opts.captcha) Object.assign(headers, await captchaHeader(opts.captcha));

    const started = Date.now();
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (_) {
      log({ method, path, status: 0, ms: Date.now() - started, body: "연결 실패", request: mask(opts.body) });
      throw new ApiError(0, { error: { code: "NETWORK", message: ERROR_MESSAGES.NETWORK } });
    }
    // 204(본문 없음)도 본문을 끝까지 읽어 연결을 정리한다. JSON이 아니면 null
    const text = await res.text().catch(() => "");
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_) {}
    log({ method, path, status: res.status, ms: Date.now() - started, body: mask(body), request: mask(opts.body) });
    if (!res.ok) {
      const err = new ApiError(res.status, body);
      // 토큰이 만료·삭제(체험 계정 24시간)됐으면 지운다. 화면은 friendlyMessage 후 로그인으로 보낸다
      if (res.status === 401 && opts.auth !== false) store.set(KEYS.auth, null);
      throw err;
    }
    return body;
  }

  /** @param {Session} auth */
  function saveSession(auth) {
    store.set(KEYS.auth, { accessToken: auth.accessToken, expiresAt: auth.expiresAt, user: auth.user });
    return auth;
  }

  // ── 시간 (한국 시간 입력 → ISO) ─────────────────────────────
  const KST_OFFSET_MS = 9 * 3600_000;
  const pad = (n) => String(n).padStart(2, "0");
  /** Date를 한국 시간 기준 { date: "2026-10-28", time: "13:05" }로 */
  function kstParts(d = new Date()) {
    const k = new Date(d.getTime() + KST_OFFSET_MS);
    return {
      date: `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`,
      time: `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`,
      weekday: "일월화수목금토"[k.getUTCDay()],
      month: k.getUTCMonth() + 1,
      day: k.getUTCDate(),
    };
  }
  /**
   * 한국 시간으로 고른 날짜·시각을 서버가 받는 ISO 문자열로 바꾼다.
   * kstIso("2026-10-28", "13:00") → "2026-10-28T13:00:00+09:00"
   * kstIso("2026-10-28T13:00") (input type=datetime-local 값) 도 된다.
   */
  function kstIso(date, time) {
    let d = String(date || "");
    let t = time;
    if (t === undefined && d.includes("T")) [d, t] = d.split("T");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`날짜 형식이 틀려요: ${date}`);
    t = String(t || "00:00").slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(t)) throw new Error(`시각 형식이 틀려요: ${time}`);
    return `${d}T${t}:00+09:00`;
  }
  /**
   * 고른 분실 구간을 서버가 받는 과거 시각으로 맞춘다.
   * 끝이 시작보다 빠르면 전날 밤부터로 본다 (23:00~01:00).
   * 구간이 통째로 미래면(지금 00:09인데 오늘 13:00~15:00) 하루 전 같은 시각으로 둔다.
   * 시작과 끝을 모두 지금으로 붙이면 카드가 00:09~00:09이 되고, 그 시각보다 먼저 등록된 습득물이 후보에서 빠진다.
   * 끝만 미래면 끝만 지금으로 줄인다.
   */
  function adjustLostWindow(from, to, now) {
    let start = from;
    let end = to;
    if (end < start) start -= 24 * 3600_000;
    if (start > now) {
      start -= 24 * 3600_000;
      end -= 24 * 3600_000;
    }
    if (end > now) end = now;
    if (start > end) start = end;
    return { from: start, to: end };
  }
  /**
   * 분실 시간대(한 날짜, 시작~끝 시각)를 { lostFrom, lostTo }로.
   * 서버는 미래 시각을 거절하므로 adjustLostWindow로 맞춘다.
   */
  function lostRange(date, fromTime, toTime) {
    const from = Date.parse(kstIso(date, fromTime));
    const to = Date.parse(kstIso(date, toTime));
    const adjusted = adjustLostWindow(from, to, Date.now());
    return { lostFrom: new Date(adjusted.from).toISOString(), lostTo: new Date(adjusted.to).toISOString() };
  }
  /** "10월 23일(금) 14:10" */
  function formatKst(iso, { time = true } = {}) {
    if (!iso) return "";
    const p = kstParts(new Date(iso));
    return `${p.month}월 ${p.day}일(${p.weekday})${time ? ` ${p.time}` : ""}`;
  }
  /** "10월 23일(금) 13:00~15:00" (날짜가 다르면 끝에도 날짜) */
  function formatRange(fromIso, toIso) {
    const a = kstParts(new Date(fromIso));
    const b = kstParts(new Date(toIso));
    return a.date === b.date ? `${formatKst(fromIso)}~${b.time}` : `${formatKst(fromIso)}~${formatKst(toIso)}`;
  }
  /** "23시간 58분 남음" / "곧 끝나요" / "시간이 지났어요" (QR 만료 표시) */
  function remaining(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return "시간이 지났어요";
    const m = Math.floor(ms / 60_000);
    if (m < 1) return "곧 끝나요";
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}시간 ${m % 60}분 남음` : `${m}분 남음`;
  }

  // ── 판정 결과 → 다음 화면 ──────────────────────────────────
  /**
   * 판정·답변 응답이나 오류를 받아 다음 화면 이름을 정한다.
   *   pass(통과) · question(확인 질문) · fail(실패, 남은 횟수 있음) · lock(이 계정 3번 다 씀) · counter(대면 확인만)
   * @param {object | ApiError} resOrErr ClaimResponse / AnswerResponse / ApiError
   * @returns {"pass"|"question"|"fail"|"lock"|"counter"|null} 판정과 관계없는 오류면 null
   */
  function claimScreen(resOrErr) {
    if (resOrErr instanceof ApiError) {
      if (resOrErr.code === "MATCH_LOCKED") return "lock";
      if (resOrErr.code === "IN_PERSON_REQUIRED") return "counter";
      return null;
    }
    const r = resOrErr || {};
    if (r.result === "PASS") return "pass";
    if (r.result === "BORDERLINE") return "question";
    if (r.result === "FAIL") {
      if (r.inPersonOnly) return "counter";
      return r.attemptsLeft > 0 ? "fail" : "lock";
    }
    return null;
  }
  /** 후보 카드의 상태: "passed"(확인 통과·수령 대기) · "open" · "locked" · "inPerson" */
  const candidateState = (c) =>
    c.awaitingPickup ? "passed" : c.inPersonOnly ? "inPerson" : c.locked ? "locked" : "open";

  // ── 사진 ─────────────────────────────────────────────────
  // 서명 URL(thumbnailUrl, imageUrl)은 백엔드 주소의 /files/... 이다. 화면과 백엔드 출처가 다르면
  // (개발: 5500 ↔ 4000) helmet의 Cross-Origin-Resource-Policy: same-origin 때문에 <img src>가 막힐 수 있어,
  // 그럴 때는 CORS fetch로 받아 blob URL로 바꾼다. 같은 출처(배포)면 그대로 쓴다.
  const apiOrigin = (() => {
    try {
      return new URL(API_BASE, location.href).origin;
    } catch (_) {
      return location.origin;
    }
  })();
  /**
   * <img>에 서명 URL을 넣는다. url이 없으면(사진 없음) 아무것도 하지 않고 false.
   * @param {HTMLImageElement} img
   * @param {string | null} url
   */
  async function setImage(img, url) {
    if (!url) return false;
    let target;
    try {
      target = new URL(url, location.href);
    } catch (_) {
      return false;
    }
    if (target.origin === location.origin) {
      img.src = url;
      return true;
    }
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      img.src = URL.createObjectURL(await res.blob());
    } catch (_) {
      img.src = url; // 마지막 시도: 그대로
    }
    return true;
  }

  // ── API ──────────────────────────────────────────────────
  window.LostApi = {
    API_BASE,
    apiOrigin,
    CONSENT_VERSION,
    CONSENT_TEXTS,
    DESCRIPTION_MIN,
    DESCRIPTION_MAX,
    ANSWER_MAX,
    CODE_TTL_SECONDS,
    CODE_RESEND_SECONDS,
    CODE_MAX_WRONG,
    CATEGORIES,
    CATEGORY_LABELS,
    SUB_CATEGORY_LABELS,
    SUB_CATEGORIES,
    COLOR_LABELS,
    aiReadSummary,
    passExplanation,
    REASON_LABELS,
    REPORT_STATUS_LABELS,
    STORAGE_TYPE_LABELS,
    ERROR_MESSAGES,
    KEYS,
    holdSignupPassword,
    heldSignupPassword,
    dropSignupPassword,
    itemLabel,
    guessCategory,
    guessSubCategory,
    colorLabel: (c) => (c && COLOR_LABELS[c]) || "",
    /** "abcd@skuniv.ac.kr" → "ab***@skuniv.ac.kr" (인증 코드 화면, 내 정보) */
    maskEmail: (email) => {
      const [id, domain] = String(email || "").split("@");
      if (!domain) return "";
      return `${id.slice(0, 2)}***@${domain}`;
    },
    /** 건물 이름. 모르면(null) 대신 쓸 말 */
    buildingName: (b, fallback = "건물 모름") => b?.name || fallback,
    /** 층 표시: -1 → "지하 1층", 3 → "3층", null → "" */
    floorLabel: (f) => (f === null || f === undefined ? "" : f < 0 ? `지하 ${-f}층` : `${f}층`),
    ApiError,
    friendlyMessage,
    store,
    mask,
    onLog,
    setCaptchaProvider,
    useCaptcha,
    CAPTCHA_ACTIONS,

    // 시간
    kstParts,
    kstIso,
    adjustLostWindow,
    itemBlockedMessage,
    lostRange,
    formatKst,
    formatRange,
    remaining,

    // 흐름 도우미
    claimScreen,
    candidateState,
    setImage,

    // 로그인 상태
    session,
    isLoggedIn,
    isDemo,
    requireLogin,
    logout,

    // ── 인증 ──
    /** POST /auth/email/code (캡차). 204. 가입된 이메일도 204 (가입 여부를 드러내지 않음) */
    async requestCode(email) {
      const normalized = String(email).trim().toLowerCase();
      store.set(KEYS.signupEmail, normalized);
      await call("/auth/email/code", {
        method: "POST",
        body: { email },
        auth: false,
        captcha: CAPTCHA_ACTIONS.emailCode,
      });
      store.set(KEYS.codeSent, { email: normalized, at: Date.now(), wrong: 0 });
    },
    /**
     * 이 이메일로 보낸 코드가 아직 쓸 수 있으면 { at, wrong }, 아니면 null.
     * 앞 화면에 갔다 와도 같은 코드를 쓰게 한다. 다시 보내면 서버가 1분 대기(429)를 걸어 메일이 안 오던 문제 (QA 10/29)
     */
    recentCode(email) {
      const sent = store.get(KEYS.codeSent);
      const normalized = String(email || "")
        .trim()
        .toLowerCase();
      if (!sent || sent.email !== normalized) return null;
      if (Date.now() - sent.at >= CODE_TTL_SECONDS * 1000 || (sent.wrong ?? 0) >= CODE_MAX_WRONG) return null;
      return { at: sent.at, wrong: sent.wrong ?? 0 };
    },
    /** 지금 코드로 틀린 횟수를 남긴다 (화면을 다시 열어도 남은 횟수가 맞게) */
    noteWrongCode() {
      const sent = store.get(KEYS.codeSent);
      if (sent) store.set(KEYS.codeSent, { ...sent, wrong: (sent.wrong ?? 0) + 1 });
    },
    /** POST /auth/email/verify → { verificationToken, expiresAt(10분) }. 저장해 두고 동의 화면에서 signup */
    async verifyCode(email, code) {
      const r = await call("/auth/email/verify", {
        method: "POST",
        body: { email, code: String(code).trim() },
        auth: false,
      });
      store.set(KEYS.verification, r);
      return r;
    },
    /**
     * POST /auth/signup → 로그인 상태가 된다.
     * @param {{ password: string, location?: boolean, verificationToken?: string }} p verificationToken을 빼면 verifyCode가 저장한 값
     */
    async signup({ password, location = false, verificationToken }) {
      const token = verificationToken || store.get(KEYS.verification)?.verificationToken;
      const r = await call("/auth/signup", {
        method: "POST",
        auth: false,
        body: {
          verificationToken: token || "",
          password,
          consent: { version: CONSENT_VERSION, email: true, externalAi: true, location: !!location },
        },
      });
      store.set(KEYS.verification, null);
      store.set(KEYS.signupPassword, null);
      return saveSession(r);
    },
    /** POST /auth/login → 로그인 상태. 틀리면 401 UNAUTHORIZED */
    async login(email, password) {
      return saveSession(await call("/auth/login", { method: "POST", body: { email, password }, auth: false }));
    },
    /** POST /auth/demo (캡차) → 새 체험 계정으로 로그인. 체험 계정은 시드 습득물만 후보로 본다 */
    async demoLogin({ location = false } = {}) {
      return saveSession(
        await call("/auth/demo", {
          method: "POST",
          auth: false,
          captcha: CAPTCHA_ACTIONS.demoLogin,
          body: { consent: { version: CONSENT_VERSION, externalAi: true, location: !!location } },
        }),
      );
    },
    /** GET /me → { id, email, role } */
    me: () => call("/me"),

    /**
     * GET /config → { captcha: { mode: "off"|"turnstile", siteKey|null } }.
     * 이 엔드포인트가 없는 서버(404)면 캡차 끔으로 본다. Turnstile을 붙일 때:
     *   const cfg = await LostApi.config();
     *   if (cfg.captcha.mode === "turnstile") { ...위젯 렌더...; LostApi.setCaptchaProvider(() => turnstile.getResponse(id)); }
     */
    async config() {
      try {
        return await call("/config", { auth: false });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { captcha: { mode: "off", siteKey: null } };
        throw e;
      }
    },

    // ── 건물 ──
    /** GET /buildings → [{ id, name, lat, lng }] */
    buildings: () => call("/buildings", { auth: false }).then((r) => r.buildings),

    // ── 분실 신고 ──
    /**
     * POST /lost-reports → { id, status, candidates[] }. 신고 id를 저장한다.
     * lostFrom/lostTo는 ISO 문자열 (lostRange·kstIso로 만든다). buildingId는 모르면 비운다.
     * 실패: 400 VALIDATION_ERROR(설명 5~500자, 미래 시각, 순서), 502 AI_UNAVAILABLE(저장 안 됨)
     * @param {{ category: string, lostFrom: string, lostTo: string, buildingId?: number|null, description: string }} p
     */
    async createReport({ category, lostFrom, lostTo, buildingId, description }) {
      const body = { category, lostFrom, lostTo, description };
      if (buildingId) body.buildingId = Number(buildingId);
      const r = await call("/lost-reports", { method: "POST", body });
      store.set(KEYS.reportId, r.id);
      store.set(KEYS.aiRead, r.aiRead ?? null);
      return r;
    },
    /** GET /lost-reports → [{ id, category, status, description, lostFrom, lostTo, building, candidateCount, createdAt }] */
    reports: () => call("/lost-reports").then((r) => r.reports),
    /**
     * GET /lost-reports/:id/candidates → Candidate[] (습득 최신순). 닫힌 신고는 [].
     * 개수는 서버 정책(backend/src/matching/policy.ts CANDIDATE_LIMIT, 지금 3개. 명세서는 "최대 5개").
     * 후보는 부를 때마다 서버가 다시 고른다: 새 물건이 들어오면 보던 후보가 빠질 수 있고, 그 물건에 claim하면 403 FORBIDDEN.
     */
    candidates: (reportId = store.get(KEYS.reportId)) =>
      call(`/lost-reports/${reportId}/candidates`).then((r) => {
        store.set(KEYS.aiRead, r.aiRead ?? null);
        return r.candidates;
      }),
    /** PATCH /lost-reports/:id { status: "CLOSED" } */
    closeReport: (reportId) => call(`/lost-reports/${reportId}`, { method: "PATCH", body: { status: "CLOSED" } }),
    /** PATCH /lost-reports/:id { description } → 다시 분석하고 후보를 다시 고른다 (502면 안 바뀜) */
    editReport: (reportId, description) =>
      call(`/lost-reports/${reportId}`, { method: "PATCH", body: { description } }).then((r) => {
        if (r && "aiRead" in r) store.set(KEYS.aiRead, r.aiRead ?? null);
        return r;
      }),

    // ── 일치 판정 ──
    /**
     * POST /lost-reports/:id/claims → PASS { matchedFields, foundItemId } | BORDERLINE { question, questions[{ text, options }] } | FAIL { attemptsLeft, inPersonOnly }
     * 다음 화면은 claimScreen(응답 또는 오류). 오류: 409 MATCH_LOCKED, 409 IN_PERSON_REQUIRED, 403, 429, 502
     */
    async claim(reportId, foundItemId) {
      const r = await call(`/lost-reports/${reportId}/claims`, { method: "POST", body: { foundItemId } });
      store.set(KEYS.claim, r);
      if (r.result === "PASS") store.set(KEYS.foundItemId, r.foundItemId);
      else store.set(KEYS.foundItemId, foundItemId);
      return r;
    },
    /**
     * POST /claims/:attemptId/answer → PASS { foundItemId } | FAIL { attemptsLeft, inPersonOnly }
     * answer: 객관식 보기 번호 배열(질문 순서대로) → { choices }, 문자열(1~50자) → { answer }
     */
    async answer(attemptId, answer) {
      const body = Array.isArray(answer) ? { choices: answer } : { answer };
      const r = await call(`/claims/${attemptId}/answer`, { method: "POST", body });
      // 답 응답에는 attemptId가 없어 붙여서 저장한다 (실패 화면에서 어떤 시도였는지 알 수 있게)
      store.set(KEYS.claim, { ...r, attemptId });
      if (r.result === "PASS") store.set(KEYS.foundItemId, r.foundItemId);
      return r;
    },

    // ── 내 물건 ──
    /**
     * GET /found-items/:id/detail (통과한 계정만, 열람 기록이 남는다)
     * → { id, category, subCategory, color, imageUrl(10분), imageUrlExpiresAt, building|null, floor|null,
     *     locationDetail|null, storageType, storagePlace|null, status, foundAt, isSeed, pickupNotice|null }
     * 오류: 403 FORBIDDEN(통과 안 함), 409 ALREADY_CLAIMED, 404
     */
    detail: (foundItemId = store.get(KEYS.foundItemId)) => call(`/found-items/${foundItemId}/detail`),
    /**
     * POST /found-items/:id/pickup-qr (보관처에 맡긴 물건)
     * → CENTER_QR | DEMO { pickupId, qrToken, status: "ISSUED", expiresAt } (체험 QR은 demoPickup으로 끝낸다)
     * 다시 부르면 이전 QR은 못 쓴다. 오류: 409 INVALID_STORAGE_TYPE, 409 ALREADY_CLAIMED
     */
    async pickupQr(foundItemId = store.get(KEYS.foundItemId)) {
      const r = await call(`/found-items/${foundItemId}/pickup-qr`, { method: "POST" });
      store.set(KEYS.pickup, r);
      return r;
    },
    /** POST /found-items/:id/demo-pickup (체험 계정의 "교무처 스캔 대신하기") → { pickupId, status: "COMPLETED", completedAt } */
    async demoPickup(foundItemId = store.get(KEYS.foundItemId)) {
      const r = await call(`/found-items/${foundItemId}/demo-pickup`, { method: "POST" });
      store.set(KEYS.pickup, r);
      return r;
    },
    /** POST /found-items/:id/self-pickup (그 자리에 둔 물건, "확인했어요") → { pickupId, method, status, completedAt } */
    async selfPickup(foundItemId = store.get(KEYS.foundItemId)) {
      const r = await call(`/found-items/${foundItemId}/self-pickup`, { method: "POST" });
      store.set(KEYS.pickup, r);
      return r;
    },

    // ── 알림 ──
    /** GET /notifications → { notifications: [{ id, type, message, foundItemId, lostReportId, readAt, createdAt }], unreadCount } */
    notifications: () => call("/notifications"),
    /** PATCH /notifications/:id/read (204) */
    readNotification: (id) => call(`/notifications/${id}/read`, { method: "PATCH" }),
    /** PATCH /notifications/read-all (204) */
    readAllNotifications: () => call("/notifications/read-all", { method: "PATCH" }),
  };
})();
