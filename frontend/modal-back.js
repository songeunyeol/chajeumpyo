// 확인 창(.modal-backdrop.is-open)이 열려 있을 때 휴대폰 뒤로 가기는 창만 닫는다 (QA 10/31: 안드로이드 뒤로 가기로 화면이 넘어감).
// 창이 열리면 같은 주소를 history에 하나 쌓고(pushState), 뒤로 가면(popstate) 그 창의 취소 버튼([data-modal-cancel])을 누른다.
// 창 안의 버튼으로 닫으면 쌓아 둔 칸을 걷어낸다(history.back). 그래서 창을 여닫아도 뒤로 가기 횟수가 늘지 않는다.
// leave-guard.js 창은 스스로 history를 다루므로 data-modal-back="off"로 뺀다.
// 다른 popstate 처리(leave-guard)보다 먼저 받도록 capture로 등록하고, 처리했으면 전파를 멈춘다.
(() => {
  const STATE_KEY = "modalBack";
  let seq = 0;
  let expectedPops = 0; // 창을 버튼으로 닫아서 우리가 부른 history.back 수
  let closingByBack = null; // 뒤로 가기로 닫는 중인 창 (이때는 history.back을 다시 부르지 않는다)
  let waiters = [];

  const watched = (el) =>
    el instanceof HTMLElement && el.classList.contains("modal-backdrop") && el.dataset.modalBack !== "off";
  const idOf = (el) => {
    if (!el.dataset.modalBackId) el.dataset.modalBackId = String(++seq);
    return el.dataset.modalBackId;
  };
  const openModals = () => [...document.querySelectorAll(".modal-backdrop.is-open")].filter(watched);

  function settle() {
    if (expectedPops > 0) return;
    const list = waiters;
    waiters = [];
    for (const fn of list) fn();
  }

  function onOpen(el) {
    if (history.state?.[STATE_KEY] === idOf(el)) return;
    history.pushState({ [STATE_KEY]: idOf(el) }, "");
  }
  function onClose(el) {
    if (closingByBack === el) {
      closingByBack = null;
      return;
    }
    if (history.state?.[STATE_KEY] !== idOf(el)) return;
    expectedPops += 1;
    history.back();
    // popstate가 오지 않는 경우(드문 브라우저)에도 기다리는 화면이 멈추지 않게
    setTimeout(() => {
      if (expectedPops > 0) {
        expectedPops = 0;
        settle();
      }
    }, 400);
  }

  const seen = new WeakMap(); // 창 → 마지막으로 본 열림 상태
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (!watched(el)) continue;
      const isOpen = el.classList.contains("is-open");
      if (seen.get(el) === isOpen) continue;
      seen.set(el, isOpen);
      if (isOpen) onOpen(el);
      else onClose(el);
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"], subtree: true });

  window.addEventListener(
    "popstate",
    (e) => {
      if (expectedPops > 0) {
        expectedPops -= 1;
        e.stopImmediatePropagation();
        settle();
        return;
      }
      const open = openModals();
      if (open.length === 0) return; // 창이 없으면 원래 뒤로 가기 (leave-guard 등)
      e.stopImmediatePropagation();
      const el = open[open.length - 1];
      closingByBack = el;
      const cancel = el.querySelector("[data-modal-cancel]");
      if (cancel instanceof HTMLElement && !cancel.hidden) cancel.click();
      if (el.classList.contains("is-open")) el.classList.remove("is-open");
    },
    true,
  );

  window.ModalBack = {
    /** 버튼으로 닫은 창의 history 칸을 다 걷어낼 때까지 기다린다. 창을 닫고 바로 다른 화면으로 넘어갈 때 쓴다 */
    settled: () => (expectedPops > 0 ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve()),
  };
})();
