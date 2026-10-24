import { useEffect, useState } from "react";

/** 목표 시각까지 남은 ms (1초마다). 목표가 없으면 0 */
export function useCountdown(targetMs: number | null, tickMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (targetMs === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [targetMs, tickMs]);
  return targetMs === null ? 0 : Math.max(0, targetMs - now);
}
