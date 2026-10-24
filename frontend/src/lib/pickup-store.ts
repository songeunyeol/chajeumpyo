/** 받은 수령 QR을 기기에 둔다. 다시 들어올 때마다 새로 받으면 이전 QR이 만료되므로 (L-11) */
export type StoredQr = { pickupId: string; qrToken: string; expiresAt: string };

const key = (foundItemId: string) => `chajeumpyo.qr.${foundItemId}`;

export function loadQr(foundItemId: string, now = Date.now()): StoredQr | null {
  try {
    const raw = localStorage.getItem(key(foundItemId));
    if (!raw) return null;
    const q = JSON.parse(raw) as StoredQr;
    return Date.parse(q.expiresAt) > now ? q : null;
  } catch {
    return null;
  }
}
export function saveQr(foundItemId: string, q: StoredQr) {
  try {
    localStorage.setItem(key(foundItemId), JSON.stringify(q));
  } catch {
    // 저장이 막혀도 화면에는 보인다
  }
}
export function clearQr(foundItemId: string) {
  try {
    localStorage.removeItem(key(foundItemId));
  } catch {
    // 무시
  }
}
