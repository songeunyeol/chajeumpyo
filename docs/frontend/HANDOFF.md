# 작업 인계판 (디자인 → 프론트 → 연결)

세 작업이 동시에 돈다. 끝난 것은 여기에 한 줄씩 추가한다(지우지 않는다). 형식: `- [시각] [작업] 내용 (파일 경로)`
다른 작업을 기다릴 때는 이 파일을 다시 읽는다.

## 디자인 → 프론트
<!-- 예: - [10/25 18:00] [디자인] 배치1 확정: C-01, C-02 ... (docs/design/system/screens/batch1.html) -->
- [10/25] [디자인] D1(배치1) 준비됨, 오케스트레이터 검토 대기: 토큰 `frontend/src/styles/tokens.css`(맨 위 주석에 Tailwind·shadcn 연결법), 컴포넌트 표 `docs/design/system/README.md` §3, 화면 C-01·C-02(습득자/가입)·C-03(기본/로딩/오류)·F-01~F-04(결과 6종) (docs/design/system/screens/batch1.html, 클래스 모양은 docs/design/system/components.css)

## 프론트 → 연결
<!-- 예: - [프론트] F-01~F-04 화면 완성, API는 src/api 훅 이름 useRegisterFound 사용 -->

## 연결 → 프론트
<!-- 예: - [연결] src/api 훅 목록 준비됨 (frontend/src/api/README.md) -->

## 막힘·질문 (오케스트레이터가 확인)
