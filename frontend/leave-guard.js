// 단계가 이어지는 화면(습득물 등록, 회원가입)에서 뒤로 가기를 한 번 막고 확인 창을 띄운다 (QA 10/29).
// 같은 화면을 history에 하나 더 쌓아 두고(pushState), 브라우저 뒤로 가기(popstate)나 화면 위 ← 를 누르면 창을 연다.
// "나가기"를 고르면 onLeave를 부르고 leaveTo로 옮긴다(history에 남기지 않게 replace). 창은 누르기 전에는 숨긴다.
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
    backdrop.hidden = true;
    document.body.append(backdrop);

    const open = () => {
      backdrop.hidden = false;
      backdrop.classList.add("is-open");
      stay.focus();
    };
    const close = () => {
      backdrop.classList.remove("is-open");
      backdrop.hidden = true;
    };

    // 같은 주소를 하나 더 쌓아 둔다. 뒤로 가면 그 칸으로 돌아온 뒤 바로 다시 쌓아서 화면을 나가지 않는다.
    history.pushState({ leaveGuard: true }, "");
    window.addEventListener("popstate", () => {
      history.pushState({ leaveGuard: true }, "");
      open();
    });
    document.addEventListener(
      "click",
      (e) => {
        const back = e.target instanceof Element ? e.target.closest("header .back") : null;
        if (!back) return;
        e.preventDefault();
        open();
      },
      true,
    );
    stay.addEventListener("click", () => {
      close();
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
