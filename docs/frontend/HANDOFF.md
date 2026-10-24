# 작업 인계판 (디자인 → 프론트 → 연결)

세 작업이 동시에 돈다. 끝난 것은 여기에 한 줄씩 추가한다(지우지 않는다). 형식: `- [시각] [작업] 내용 (파일 경로)`
다른 작업을 기다릴 때는 이 파일을 다시 읽는다.

## 디자인 → 프론트
<!-- 예: - [10/25 18:00] [디자인] 배치1 확정: C-01, C-02 ... (docs/design/system/screens/batch1.html) -->
- [10/25] [디자인] D1(배치1) 준비됨, 오케스트레이터 검토 대기: 토큰 `frontend/src/styles/tokens.css`(맨 위 주석에 Tailwind·shadcn 연결법), 컴포넌트 표 `docs/design/system/README.md` §3, 화면 C-01·C-02(습득자/가입)·C-03(기본/로딩/오류)·F-01~F-04(결과 6종) (docs/design/system/screens/batch1.html, 클래스 모양은 docs/design/system/components.css)
- [10/25] [디자인] D1 승인됨. D2(배치2) 준비됨, 검토 대기: L-01~L-12, C-04, C-05 (docs/design/system/screens/batch2.html, 노트·LockReveal 타이밍은 README §4 배치 2). 배치1 변경: C-02 문구는 `CONSENT_TEXTS`·`CONSENT_VERSION` import(하드코딩 금지), 후보 썸네일 CSS `blur(14px) grayscale(1)`, 예시 날짜 10월 23일(금). tokens.css는 biome 포맷 통과(값 변화 없음)

## 프론트 → 연결
<!-- 예: - [프론트] F-01~F-04 화면 완성, API는 src/api 훅 이름 useRegisterFound 사용 -->

- [10/25] [프론트] P1 뼈대 완료: Vite8+React19+TS, Tailwind4(`@theme inline`으로 tokens.css 연결), shadcn/ui 스타일 컴포넌트(`src/components/ui`), 모든 화면 ID 경로(`src/routes/index.tsx`, 표는 `frontend/README.md`), 흐름 띠·체험 모드 띠·하단 탭(`src/components/layout`), PWA manifest. 화면은 `@/data`에서만 훅을 가져온다(`src/data/index.ts`가 유일한 교체 지점, 지금은 `src/data/mock`). 기대 훅: useSession·useLogout·useLogin·useAdminLogin·useDemoLogin·useRequestEmailCode·useVerifyEmailCode·useSignup·useMe·useBuildings·useStoragePlaces(buildingId?)·useRegisterFoundItem·useLostReports·useCandidates(reportId)·useCreateLostReport·useUpdateLostReport(id)·useClaim(reportId)·useAnswer(attemptId)·useFoundItemDetail(id)·useIssuePickupQr(id)·useSelfPickup(id)·useNotifications·useMarkNotificationRead·useMarkAllNotificationsRead·useAdminFoundItems({status,page})·useAdminFoundItem(id)·useUpdateAdminFoundItem(id)·useInPersonPickup(id)·useScanPickup·useCompletePickup·useHotspots({from,to}). `src/api`의 이름·모양과 거의 같아서, 연결이 준비되면 `src/data/index.ts`를 `export * from "@/api"`로 바꾸고 main.tsx를 ApiProvider로 감싸면 된다(프론트가 P2에서 처리 가능). 오류는 `code`·`status`를 가진 객체로 던지면 `src/lib/errors.ts`가 읽는다.

## 연결 → 프론트
<!-- 예: - [연결] src/api 훅 목록 준비됨 (frontend/src/api/README.md) -->
- [10/25] [연결] I1: `src/api` 훅 준비됨(671c5b1). 이름·입력 모양을 `src/data/mock/hooks.ts`에 맞췄어요. 교체: `src/data/index.ts` → `export * from "@/api"; export type { AdminListParams, HotspotParams } from "./types";` + main.tsx를 `<ApiProvider onExpired={...}>`로 감싸기(QueryClientProvider 포함이라 따로 두지 마세요). 표·주의점: `frontend/src/api/README.md`. 다른 점: ① `useSession(scope?)`는 주소가 `/admin…`이면 관리자 세션, 아니면 회원 세션(회원·관리자 토큰을 따로 저장) ② 오류는 `ApiError{code,status,message,details}`(lib/errors.ts 그대로 읽힘), 브라우저 코드 `NETWORK_ERROR·TIMEOUT·INVALID_RESPONSE`는 `CLIENT_ERROR_MESSAGES` ③ 401(토큰 보낸 요청)은 세션을 지우고 `/login?expired=1`(체험 `?expired=demo`, 관리자 `/admin/login?expired=1`)로 보내요 ④ 등록은 보내기 전에 사진을 캔버스로 다시 그려 EXIF(GPS)를 지워요 — 건물 추천 EXIF는 그 전에 원본에서 읽기. 실제 AI 대기: 등록·신고·판정은 30초 제한, F-03·L-07은 10초 넘게 버티게.

## 막힘·질문 (오케스트레이터가 확인)
- [10/25] [프론트] `npx biome check frontend`가 `src/styles/tokens.css`(디자인, 한 줄에 여러 선언 → 포매터 오류)와 `src/api`·`src/lib/http.test.ts`·`src/lib/auth.test.tsx`(연결, 서식·noUnsafeOptionalChaining)에서 실패해요. 각 작업이 자기 파일에 `npx biome check --write`를 돌려 주세요. Tailwind 지시어 파싱은 `frontend/biome.json`(중첩 설정)으로 켰어요.
- [10/25] [프론트] `backend/prisma/seed-data/buildings.json`·`storage-places.json`이 비어 있어 실제 API로는 F-02 건물·보관처 목록이 빈 채로 나와요. 가짜 데이터는 캠퍼스 중심 좌표 주변 임시값으로 화면을 그려요.
- [10/25] [연결] 위 biome 지적(src/api·http.test·auth.test)은 671c5b1에서 고쳤어요. 건물·보관처: 개발 DB에는 `tester/seed-dev.mts`로 이미 들어 있어요(4100 API에서 건물 6·보관처 3 확인). I2에서 `backend/scripts/seed-dev.ts`로 옮겨요. `tsconfig.app.json`의 `baseUrl`이 TS 6에서 경고(TS5101)라 `tsc`가 멈춰요 — `"ignoreDeprecations": "6.0"`을 넣거나 `baseUrl`을 빼고 `paths`만 두세요(프론트 파일).
