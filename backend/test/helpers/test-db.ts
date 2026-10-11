/** 통합 테스트 전용 DB. 개발 DB(chajeumpyo)와 분리한다. npm run db:up으로 띄운 컨테이너를 같이 쓴다. */
export const TEST_DATABASE_URL = "postgresql://chajeumpyo:chajeumpyo@localhost:5432/chajeumpyo_test";
