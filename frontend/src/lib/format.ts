const KST = "Asia/Seoul";

/** 10월 24일 (금) */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric", weekday: "short" }).format(
    new Date(iso),
  );
}

/** 10월 24일 오후 3:20 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** 오후 3:20 */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** 방금 / 5분 전 / 3시간 전 / 2일 전 */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return formatDate(iso);
}

/** 층 표시: -1 → 지하 1층, 3 → 3층, null → 층 모름 */
export function formatFloor(floor: number | null | undefined): string {
  if (floor === null || floor === undefined) return "층 모름";
  if (floor < 0) return `지하 ${Math.abs(floor)}층`;
  return `${floor}층`;
}

/** 남은 시간 mm:ss */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 24시간 남음 / 3시간 20분 남음 / 12분 남음 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "만료됨";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분 남음`;
  if (m === 0) return `${h}시간 남음`;
  return `${h}시간 ${m}분 남음`;
}
