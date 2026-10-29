// 단계가 이어지는 화면(습득물 등록, 회원가입)에서 뒤로 가기를 한 번 막고 확인 창을 띄운다 (QA 10/29).
// 같은 화면을 history에 하나 더 쌓아 두고(pushState), 브라우저 뒤로 가기(popstate)나 화면 위 ← 를 누르면 창을 연다.
// "나가기"를 고르면 onLeave를 부르고 leaveTo로 옮긴다(history에 남기지 않게 replace). "계속하기"면 다시 쌓는다.
(function () {
  function install({ title, message, leaveTo, leaveLabel = "나가기", stayLabel = "계속하기", onLeave }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "modal-card";
    const h = document.createElement("h3");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = message;
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const stay = document.createElement("button");
    stay.type = "button";
    stay.className = "btn gray";
    stay.textContent = stayLabel;
    const leave = document.createElement("button");
    leave.type = "button";
    leave.className = "btn";
    leave.textContent = leaveLabel;
    actions.append(stay, leave);
    card.append(h, p, actions);
    backdrop.append(card);
    document.body.append(backdrop);

    let fromHistory = false;
    const open = (viaHistory) => {
      fromHistory = viaHistory;
      backdrop.classList.add("is-open");
      stay.focus();
    };
    const close = () => backdrop.classList.remove("is-open");

    history.pushState({ leaveGuard: true }, "");
    window.addEventListener("popstate", () => open(true));
    for (const a of document.querySelectorAll("header .back")) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        open(false);
      });
    }
    stay.addEventListener("click", () => {
      close();
      if (fromHistory) history.pushState({ leaveGuard: true }, "");
    });
    leave.addEventListener("click", () => {
      close();
      try {
        onLeave?.();
      } catch (_) {}
      location.replace(leaveTo);
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) stay.click();
    });
  }

  window.LeaveGuard = { install };
})();
