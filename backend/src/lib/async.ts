/**
 * 제한 시간 안에 끝나지 않으면 실패로 본다.
 * 알려진 한계 (10/30 코드 평가): 원래 요청을 중단하지는 않는다(응답만 버림). AI 호출은 기본 모델→대체 모델 전체가
 * 이 시간 하나에 들어가고, 바깥 retryOnce로 한 번 더 부를 수 있어 최악에는 호출이 4번 날 수 있다.
 * 실패하면 검토 대기·재시도 안내로 넘어가 사용자 쪽 위험은 작다. 요청 중단(AbortSignal)과 모델별 시간 나누기는 운영 전 과제.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 시간 초과 (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** 실패하면 한 번 더 시도한다. (기능 명세서 F-02: 한 번 재시도) */
export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}
