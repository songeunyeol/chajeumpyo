// 인터넷이 끊겼을 때 화면 위에 안내를 띄운다 (QA 10/31: 오프라인이면 빈 목록·깨진 화면이 그대로 보였다).
// 각 화면의 API 모듈(lost/api.js, found/api.js, admin/admin.js)이 이 파일을 불러오고, 요청마다 결과를 report(ok, isGet)로 알린다.
// 이 파일이 늦게 받아져도 놓치지 않게, 그 전의 알림은 window.OfflineNotice 배열에 쌓였다가 여기서 한 번에 처리한다.
// - 화면이 아직 데이터를 하나도 못 받았는데 불러오기(GET)가 연결 실패 → 화면 전체를 덮는 안내 + "다시 시도"
// - 이미 데이터를 받은 화면(예: QR 화면의 상태 확인)이나 저장 요청이 연결 실패, 또는 offline 이벤트 → 위쪽 띠 안내만.
//   보고 있던 QR·목록은 가리지 않는다
// - 다시 연결되면(online 이벤트) 띠는 사라지고, 덮는 안내가 떠 있던 화면은 새로고침해 데이터를 다시 받는다.
//   입력 중인 칸이 있으면 적은 내용이 사라지지 않게 새로고침하지 않는다
// 올리는 중 화면(found/uploading.html)은 자체 "다시 시도" 화면이 있어 여기서는 아무것도 하지 않는다.
(() => {
  const queued = Array.isArray(window.OfflineNotice) ? window.OfflineNotice : [];
  if (window.OfflineNotice && !Array.isArray(window.OfflineNotice)) return;

  const disabled = ["/found/uploading"].some((p) => location.pathname.endsWith(p));
  let loaded = false; // 이 화면에서 API 응답을 한 번이라도 받았는가
  let blocking = false; // 화면을 덮는 안내가 떠 있는가
  let dirty = false; // 사용자가 입력칸에 무언가 적었는가
  let blockEl = null;
  let bannerEl = null;

  document.addEventListener("input", () => (dirty = true), true);

  const C = {
    paper: "var(--paper, #f3efe6)",
    ink: "var(--ink, #1c1915)",
    green: "var(--green, #1e5b3d)",
    mute: "var(--mute, #6b655d)",
  };

  function banner() {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement("div");
    bannerEl.className = "offline-banner";
    bannerEl.setAttribute("role", "status");
    bannerEl.textContent = "인터넷이 끊겼어요. 연결되면 다시 시도해 주세요.";
    Object.assign(bannerEl.style, {
      position: "fixed",
      left: "0",
      right: "0",
      top: "0",
      zIndex: "1000",
      padding: "calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px",
      background: C.ink,
      color: "#fff",
      font: "600 14px/1.4 Pretendard Variable, Pretendard, sans-serif",
      textAlign: "center",
      pointerEvents: "none",
    });
    bannerEl.hidden = true;
    document.body.appendChild(bannerEl);
    return bannerEl;
  }

  function block() {
    if (blockEl) return blockEl;
    blockEl = document.createElement("div");
    blockEl.className = "offline-block";
    blockEl.setAttribute("role", "alert");
    Object.assign(blockEl.style, {
      position: "fixed",
      inset: "0",
      zIndex: "1001",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: "12px",
      padding: "24px max(16px, env(safe-area-inset-left, 0px))",
      background: C.paper,
      color: C.ink,
      font: "16px/1.5 Pretendard Variable, Pretendard, sans-serif",
      textAlign: "center",
    });
    const h = document.createElement("h2");
    h.textContent = "인터넷 연결을 확인해 주세요";
    Object.assign(h.style, { margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "-0.03em" });
    const p = document.createElement("p");
    p.className = "offline-block-msg";
    p.textContent = "연결되면 자동으로 다시 불러와요.";
    Object.assign(p.style, { margin: "0 0 8px", color: C.mute });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "offline-retry";
    btn.textContent = "다시 시도";
    Object.assign(btn.style, {
      alignSelf: "center",
      minWidth: "200px",
      minHeight: "48px",
      padding: "0 24px",
      border: "0",
      borderRadius: "14px",
      background: C.green,
      color: "#fff",
      font: "650 17px/1 Pretendard Variable, Pretendard, sans-serif",
      cursor: "pointer",
    });
    btn.addEventListener("click", retry);
    const home = document.createElement("a");
    home.href = "/";
    home.textContent = "처음 화면";
    Object.assign(home.style, { color: C.ink, fontSize: "15px" });
    blockEl.append(h, p, btn, home);
    blockEl.hidden = true;
    document.body.appendChild(blockEl);
    return blockEl;
  }

  function setBlockMessage(text) {
    const p = block().querySelector(".offline-block-msg");
    if (p) p.textContent = text;
  }

  /** 서버에 닿는지 확인하고, 닿으면 새로고침해 데이터를 다시 받는다 */
  async function retry() {
    const btn = block().querySelector(".offline-retry");
    btn.disabled = true;
    btn.textContent = "확인 중…";
    try {
      // 응답이 오기만 하면(상태 코드와 상관없이) 연결된 것이다
      await fetch("/health", { cache: "no-store" });
      location.reload();
    } catch (_) {
      setBlockMessage("아직 연결되지 않았어요. 와이파이나 데이터를 확인해 주세요.");
      btn.disabled = false;
      btn.textContent = "다시 시도";
    }
  }

  function showBanner() {
    if (disabled || blocking || !document.body) return;
    banner().hidden = false;
  }

  function showBlock() {
    if (disabled || !document.body) return;
    blocking = true;
    if (bannerEl) bannerEl.hidden = true;
    block().hidden = false;
    block().querySelector(".offline-retry")?.focus();
  }

  /**
   * API 모듈이 요청마다 부른다.
   * @param {boolean} ok 서버에 닿았는가 (HTTP 오류여도 닿았으면 true)
   * @param {boolean} isGet 불러오기 요청인가
   */
  function report(ok, isGet) {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => report(ok, isGet), { once: true });
      return;
    }
    if (ok) {
      loaded = true;
      if (bannerEl) bannerEl.hidden = true;
      return;
    }
    if (isGet && !loaded) showBlock();
    else showBanner();
  }

  window.addEventListener("offline", showBanner);
  window.addEventListener("online", () => {
    if (bannerEl) bannerEl.hidden = true;
    if (blocking && !dirty) location.reload();
    else if (blocking) setBlockMessage("다시 연결됐어요. '다시 시도'를 눌러 주세요.");
  });

  window.OfflineNotice = { report };
  const run = () => {
    for (const [ok, isGet] of queued) report(ok, isGet);
    if (navigator.onLine === false) showBanner();
  };
  if (document.body) run();
  else document.addEventListener("DOMContentLoaded", run, { once: true });
})();
