/**
 * 분실자 시연용 알림. sessionStorage `alerts`만 읽고 쓴다.
 */
(function () {
  const KEY = "alerts";

  function readRaw() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(KEY) || "null");
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function write(list) {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  }

  function todayLabel() {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const d = new Date();
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[d.getDay()]})`;
  }

  function seed() {
    const now = Date.now();
    return [
      {
        id: "al-report-rep-seed-active",
        type: "report",
        title: "후보 3개",
        meta: `무선 이어폰 · ${todayLabel()}`,
        href: "candidates.html",
        reportId: "rep-seed-active",
        createdAt: now - 60 * 1000,
        read: false
      },
      {
        id: "al-pass-rep-seed-closed",
        type: "passed",
        title: "확인을 통과했어요",
        meta: "우산 · 10월 20일",
        href: "item.html?from=closed&id=rep-seed-closed",
        reportId: "rep-seed-closed",
        createdAt: now - 8 * 24 * 60 * 60 * 1000,
        read: false
      }
    ];
  }

  function list() {
    const current = readRaw();
    if (current) return current.slice();
    const seeded = seed();
    try {
      write(seeded);
    } catch (_) {}
    return seeded;
  }

  function push(alert) {
    const current = list().filter((item) => item.id !== alert.id);
    const next = [{ ...alert, read: Boolean(alert.read) }, ...current];
    try {
      write(next);
    } catch (_) {}
    return next;
  }

  function markAllRead() {
    const next = list().map((item) => ({ ...item, read: true }));
    try {
      write(next);
    } catch (_) {}
    return next;
  }

  function removeByReport(reportId) {
    const next = list().filter((item) => item.reportId !== reportId);
    try {
      write(next);
    } catch (_) {}
    return next;
  }

  function unreadTone() {
    const unread = list().filter((item) => !item.read);
    if (unread.length === 0) return null;
    if (unread.some((item) => item.type === "passed")) return "red";
    return "green";
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  window.ChajeumAlerts = {
    list,
    push,
    markAllRead,
    removeByReport,
    unreadTone,
    esc
  };
})();
