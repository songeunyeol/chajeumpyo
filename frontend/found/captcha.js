// 사진 화면의 사람 확인 (Cloudflare Turnstile). api.js 다음에 불러온다.
// GET /config가 turnstile일 때만 Cloudflare 스크립트를 부르고 위젯을 그린다. off(개발)면 아무것도 하지 않고,
// 등록 요청은 api.js가 개발용 토큰("dev-pass")을 그대로 보낸다.
// 받은 토큰은 sessionStorage(FoundApi.CAPTCHA_KEY)에 두고, 다음 화면(uploading.html)의 등록 요청이 꺼내 쓴다.
(() => {
  const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const OFF = { mode: "off", ready: () => Promise.resolve(), reset() {}, remove() {} };

  function save(token) {
    try {
      if (token) sessionStorage.setItem(FoundApi.CAPTCHA_KEY, JSON.stringify({ token, at: Date.now() }));
      else sessionStorage.removeItem(FoundApi.CAPTCHA_KEY);
    } catch (_) {}
  }

  let scriptPromise = null;
  function loadScript() {
    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SCRIPT_URL;
        s.async = true;
        s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no turnstile")));
        s.onerror = () => {
          scriptPromise = null;
          reject(new Error("캡차 스크립트를 불러오지 못했어요."));
        };
        document.head.appendChild(s);
      });
    }
    return scriptPromise;
  }

  const READY_TIMEOUT_MS = 30_000;

  /**
   * container에 위젯을 그린다. ready()는 토큰을 받을 때까지 기다린다.
   * 토큰이 만료되면 위젯이 스스로 새로 받는다(refresh-expired: auto). 대부분은 체크 없이 통과하고,
   * 의심스러울 때만 상자가 나타난다(appearance: interaction-only).
   * ready()는 위젯 오류(예: 도메인 미등록)나 30초 시간 초과면 실패(reject)한다. 화면은 버튼을 되돌리고 다시 누르게 한다.
   */
  async function mount(container, { onError } = {}) {
    const { captcha } = await FoundApi.config();
    if (captcha.mode !== "turnstile" || !captcha.siteKey) return OFF;

    save(null); // 이전에 받은 토큰은 이미 썼을 수 있어 새로 받는다
    let token = null;
    let lastError = null; // 위젯이 오류 상태면 ready()는 기다리지 않고 바로 실패한다(클릭 전에 오류가 났을 때)
    let waiters = [];
    const flush = (err) => {
      const list = waiters;
      waiters = [];
      for (const w of list) err ? w.reject(err) : w.resolve();
    };
    const settle = (t) => {
      token = t;
      save(t);
      if (t) {
        lastError = null;
        flush();
      }
    };

    const turnstile = await loadScript();
    container.replaceChildren(); // 다시 그릴 때 이전 위젯 자리를 비운다
    const widgetId = turnstile.render(container, {
      sitekey: captcha.siteKey,
      action: "found-analyze",
      appearance: "interaction-only",
      "refresh-expired": "auto",
      callback: (t) => settle(t),
      "expired-callback": () => settle(null),
      "error-callback": (code) => {
        settle(null);
        lastError = new Error(`캡차 오류 ${code ?? ""}`.trim());
        flush(lastError);
        onError?.(code);
        return true; // 처리했다고 알린다. 위젯은 스스로 다시 시도한다
      },
    });

    return {
      mode: "turnstile",
      ready(timeoutMs = READY_TIMEOUT_MS) {
        if (token) return Promise.resolve();
        if (lastError) return Promise.reject(lastError);
        return new Promise((resolve, reject) => {
          const w = {
            resolve: () => {
              clearTimeout(timer);
              resolve();
            },
            reject: (err) => {
              clearTimeout(timer);
              reject(err);
            },
          };
          const timer = setTimeout(() => {
            waiters = waiters.filter((x) => x !== w);
            reject(new Error("캡차 시간 초과"));
          }, timeoutMs);
          waiters.push(w);
        });
      },
      reset() {
        settle(null);
        lastError = null;
        try {
          turnstile.reset(widgetId);
        } catch (_) {}
      },
      remove() {
        settle(null);
        flush(new Error("캡차 위젯 제거"));
        try {
          turnstile.remove(widgetId);
        } catch (_) {}
      },
    };
  }

  window.FoundCaptcha = { mount };
})();
