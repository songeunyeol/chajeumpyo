/**
 * 학교 메일 칸: 아이디만 입력하고 "@skuniv.ac.kr"은 고정으로 붙인다.
 * 서경대 학생·교직원 서비스라 다른 도메인은 받지 않는다 (서버도 ALLOWED_EMAIL_DOMAINS로 거절한다).
 */
(function () {
  const SCHOOL_DOMAIN = "skuniv.ac.kr";

  /**
   * 입력값을 아이디로 정리한다. 전체 주소를 붙여 넣으면 아이디만 남긴다.
   * 다른 도메인이면 error를 돌려준다.
   */
  function schoolEmailId(raw) {
    const v = String(raw || "").trim();
    const at = v.indexOf("@");
    if (at === -1) return { id: v, error: "" };
    const id = v.slice(0, at).trim();
    const domain = v.slice(at + 1).trim().toLowerCase();
    if (domain === "" || SCHOOL_DOMAIN.startsWith(domain)) return { id, error: "" };
    return { id, error: "서경대 메일만 쓸 수 있어요." };
  }

  /** 아이디 형식: 공백·@ 없이 1자 이상 */
  function isValidSchoolId(id) {
    return /^[^\s@]+$/.test(id);
  }

  /**
   * 보이는 아이디 칸과 숨은 전체 주소 칸을 잇는다.
   * onDomainError(message)는 다른 도메인을 붙여 넣었을 때 부른다.
   */
  function bindSchoolEmail(idInput, fullInput, onDomainError) {
    let domainError = "";
    const sync = () => {
      const { id, error } = schoolEmailId(idInput.value);
      domainError = error;
      // 다른 도메인은 고쳐 쓰지 않는다. 엉뚱한 주소로 가입되지 않게 그대로 두고 안내만 한다
      if (!error && idInput.value.includes("@")) idInput.value = id;
      fullInput.value = !error && id ? `${id}@${SCHOOL_DOMAIN}` : "";
      if (error && onDomainError) onDomainError(error);
      return error;
    };
    idInput.addEventListener("input", sync);
    idInput.addEventListener("change", sync);
    sync();
    return {
      email: () => fullInput.value.trim(),
      error: () => domainError,
      valid: () => !domainError && isValidSchoolId(idInput.value.trim()),
    };
  }

  window.SchoolEmail = { SCHOOL_DOMAIN, schoolEmailId, isValidSchoolId, bindSchoolEmail };
})();
