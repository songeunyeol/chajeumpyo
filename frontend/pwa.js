/* 서비스 워커 등록. HTTPS나 localhost에서만 동작한다(브라우저 규칙). */
(() => {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      // 등록에 실패해도 화면은 그대로 쓸 수 있다.
      console.warn("서비스 워커 등록 실패", err);
    });
  });
})();
