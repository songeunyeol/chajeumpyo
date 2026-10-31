// 단계가 이어지는 화면(습득물 등록, 회원가입)에서 뒤로 가기를 한 번 막고 확인 창을 띄운다 (QA 10/29).
// 같은 화면을 history에 하나 더 쌓아 두고(pushState), 브라우저 뒤로 가기(popstate)나 화면 위 ← 를 누르면 창을 연다.
// "나가기"를 고르면 onLeave를 부르고 leaveTo로 옮긴다(history에 남기지 않게 replace). 창은 누르기 전에는 숨긴다.
// install은 { isOpen, afterStay(fn) }를 돌려준다. 창이 열린 동안 화면이 스스로 다음으로 넘어가지 않게 미룰 때 쓴다 (QA 10/31).
(() => {
  function install({ title, message, leaveTo, leaveLabel = "나가기", stayLabel = "계속하기", onLeave }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.dataset.modalBack = "off"; // 이 창은 아래에서 history를 직접 다룬다 (modal-back.js 제외)
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
    let staying = [];

    // 같은 주소를 하나 더 쌓아 둔다. 뒤로 가면 그 칸으로 돌아온 뒤 바로 다시 쌓아서 화면을 나가지 않는다.
    history.pushState({ leaveGuard: true }, "");
    let proceeding = null; // 다음 단계로 넘어가는 중이면 그 주소
    window.addEventListener("popstate", () => {
      if (proceeding) {
        location.replace(proceeding);
        return;
      }
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
      const run = staying;
      staying = [];
      for (const fn of run) fn();
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

    /**
     * 확인 창 없이 다음 단계(url)로 넘어간다. 쌓아 둔 칸을 먼저 걷어내고(history.back) 이 화면 칸을 url로 바꾼다.
     * 그래서 다음 화면에서 뒤로 가면 이 화면(빈 입력 폼)이 아니라 그 전 화면으로 간다 (QA 10/31 뒤로 가기).
     */
    return {
      proceed(url) {
        if (proceeding) return;
        proceeding = url;
        const go = () => {
          if (history.state?.leaveGuard) {
            history.back();
            // popstate가 오지 않는 브라우저를 위해 잠시 뒤에는 그냥 넘어간다
            setTimeout(() => location.replace(url), 400);
          } else location.replace(url);
        };
        // 방금 닫은 확인 창(modal-back.js)의 history 칸을 먼저 걷어낸 뒤에 넘어간다
        if (window.ModalBack) window.ModalBack.settled().then(go);
        else go();
      },
      isOpen: () => !backdrop.hidden,
      /** "계속하기"로 창을 닫으면 fn을 부른다. "나가기"를 고르면 부르지 않는다 */
      afterStay: (fn) => staying.push(fn),
    };
  }

  window.LeaveGuard = { install };
})();
