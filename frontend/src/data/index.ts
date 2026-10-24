/**
 * 화면이 쓰는 데이터 훅의 단일 진입점.
 * 지금은 가짜 데이터(mock)를 내보낸다. 연결 작업이 src/api 훅을 만들면 이 파일만 바꿔 `@/api`에서 다시 내보낸다.
 * (화면 확인·스크린샷용 가짜 데이터는 VITE_USE_MOCKS=true일 때만 쓰도록 남겨 둔다.)
 * 화면 컴포넌트는 fetch를 직접 부르지 않고 여기 훅만 쓴다.
 */
export * from "./mock/hooks";
export type * from "./types";
