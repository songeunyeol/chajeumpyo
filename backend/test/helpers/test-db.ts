/**
 * 통합 테스트 전용 DB. 개발 DB와 같은 컨테이너를 쓰고 DB 이름만 chajeumpyo_test로 바꾼다.
 * 접속 정보는 루트 .env의 DATABASE_URL에서 읽는다(비밀번호를 코드에 두지 않기 위해).
 */
function resolveTestDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(new URL("../../../.env", import.meta.url));
    } catch {
      // .env가 없으면 아래에서 안내한다.
    }
  }
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("루트 .env에 DATABASE_URL을 넣어 주세요. (.env.example 참고)");
  const url = new URL(base);
  url.pathname = "/chajeumpyo_test";
  return url.toString();
}

export const TEST_DATABASE_URL = resolveTestDatabaseUrl();
