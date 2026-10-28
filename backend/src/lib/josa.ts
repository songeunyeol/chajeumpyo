// 알림·관리자 문구의 조사. "무선 이어폰이(가)" 대신 받침에 맞춰 "무선 이어폰이"로 붙인다.

/** [받침 있을 때, 받침 없을 때]. 으로/로는 ㄹ 받침도 "로" */
const PAIRS = {
  "이/가": ["이", "가"],
  "을/를": ["을", "를"],
  "은/는": ["은", "는"],
  "과/와": ["과", "와"],
  "으로/로": ["으로", "로"],
} as const;

export type Josa = keyof typeof PAIRS;

/** 받침: 없음, ㄹ, 그 밖의 받침, 알 수 없음 */
type Final = "none" | "rieul" | "other" | "unknown";

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const RIEUL = 8;

/** 숫자를 한국어로 읽었을 때의 받침 (영, 일, 이, 삼, 사, 오, 육, 칠, 팔, 구) */
const DIGIT_FINAL: Final[] = ["other", "rieul", "none", "other", "none", "none", "other", "rieul", "rieul", "none"];

/** 끝의 괄호·따옴표·마침표·공백은 건너뛴다 */
const TRAILING = /[\s)\]}>"'’”.·,!?~-]+$/u;

function finalOf(word: string): Final {
  const trimmed = word.replace(TRAILING, "");
  const ch = trimmed.at(-1);
  if (!ch) return "unknown";
  const code = ch.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) {
    const jong = (code - HANGUL_START) % 28;
    if (jong === 0) return "none";
    return jong === RIEUL ? "rieul" : "other";
  }
  if (ch >= "0" && ch <= "9") return DIGIT_FINAL[Number(ch)] ?? "unknown";
  // 영문은 읽는 법이 갈려서 확실한 끝만 정한다 (l → ㄹ, m·n·ng → 받침). 나머지는 모름
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("l")) return "rieul";
  if (lower.endsWith("m") || lower.endsWith("n") || lower.endsWith("ng")) return "other";
  return "unknown";
}

/** 조사만 고른다. 받침을 알 수 없으면 "이(가)"처럼 둘 다 적는다 */
export function pickJosa(word: string, josa: Josa): string {
  const [withFinal, withoutFinal] = PAIRS[josa];
  const final = finalOf(word);
  if (final === "unknown") return josa === "으로/로" ? "(으)로" : `${withFinal}(${withoutFinal})`;
  if (final === "none") return withoutFinal;
  if (final === "rieul" && josa === "으로/로") return withoutFinal;
  return withFinal;
}

/** 낱말에 조사를 붙인다: withJosa("무선 이어폰", "이/가") → "무선 이어폰이" */
export function withJosa(word: string, josa: Josa): string {
  return `${word}${pickJosa(word, josa)}`;
}
