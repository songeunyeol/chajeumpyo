// 개발용 더미 습득물의 습득 시각. 지금 기준으로 최근에 두어서, 분실 신고 "오늘"(오늘 0시~지금)에도 후보로 잡히게 한다.
// seed-dev.ts가 등록 직후와 --refresh-dates에서 같은 값을 쓴다 (몇 번 돌려도 결과는 "지금 기준 같은 간격").

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** 한국 시간 = UTC+9 (서머타임 없음) */
const KST = 9 * HOUR;

/** 그 시각이 속한 한국 날짜의 0시 */
export function startOfKstDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + KST) / DAY) * DAY - KST);
}

/**
 * 샘플 순서(seed-dev.ts samples)별로 지금에서 얼마나 전에 주웠는지. 빠진 순서는 1시간 전.
 * "today"가 붙은 것(체험 시드 둘, 실제 이어폰)은 오늘 0시보다 앞서지 않게 자른다.
 */
export const SAMPLE_AGES: { ago: number; today?: boolean }[] = [
  { ago: 20 * MIN, today: true }, // 0 유담관 이어폰(실제)
  { ago: 3 * HOUR }, // 1 청운관 우산
  { ago: 1 * DAY }, // 2 지갑
  { ago: 2 * DAY }, // 3 텀블러
  { ago: 4 * DAY }, // 4 스마트키
  { ago: 5 * MIN, today: true }, // 5 체험 이어폰
  { ago: 10 * MIN, today: true }, // 6 체험 아이폰
];

export function seedDates(index: number, now: Date, retentionDays: number): { foundAt: Date; expiresAt: Date } {
  const age = SAMPLE_AGES[index] ?? { ago: HOUR };
  let found = now.getTime() - age.ago;
  if (age.today) found = Math.max(found, startOfKstDay(now).getTime());
  return { foundAt: new Date(found), expiresAt: new Date(found + retentionDays * DAY) };
}
