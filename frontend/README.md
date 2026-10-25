# 찾음표 프론트엔드

React + Vite SPA (TypeScript), React Router 7, TanStack Query 5, Tailwind 4 + shadcn/ui(new-york, `src/components/ui`), vite-plugin-pwa.
화면 계약은 `docs/frontend/screens.md`, 디자인은 `docs/design/system/` + `src/styles/tokens.css`(디자인 작업 소유).

## 실행

```bash
npm install                     # 레포 루트에서 (frontend는 워크스페이스)
npm run dev -w frontend         # http://localhost:5173 (백엔드 CORS 기본값)
VITE_USE_MOCKS=true npm run dev -w frontend   # 가짜 데이터로 화면만 볼 때
npm run build -w frontend       # tsc + vite build (+ PWA 서비스 워커)
npm run typecheck -w frontend
npm run test -w frontend        # vitest + Testing Library
npx biome check frontend
```

실서버 API(4100)는 `npx tsx frontend/e2e/start-dev-api.mts`로 띄워요(레포 루트에서). 사진 링크 주소는 늘 `http://localhost:4100`으로 맞춰요. 개발 DB를 다른 폴더(본 체크아웃 등)의 서버와 같이 쓰면, 그 서버가 올린 사진은 그 폴더에 있으니 **절대 경로**로 알려 주세요: `STORAGE_LOCAL_DIR=/절대/경로/chajeumpyo/backend/uploads npx tsx frontend/e2e/start-dev-api.mts`. 경로는 커밋하지 말고 셸에서만 넘겨요. 자세한 것은 `frontend/e2e/README.md`.

환경 변수(`frontend/.env`, 커밋 금지): `VITE_API_BASE`(기본 `http://localhost:4100/api/v1`), `VITE_TURNSTILE_SITE_KEY`(비우면 개발용 통과 토큰, 백엔드 `CAPTCHA_MODE=off`일 때만 통과), `VITE_NAVER_MAP_CLIENT_ID`(비우면 건물 목록으로 대신 보여 줌).

## 구조

| 경로 | 내용 | 소유 |
|---|---|---|
| `src/styles/tokens.css` | 디자인 토큰 | 디자인 |
| `src/index.css` | Tailwind 4 `@theme inline`으로 토큰 연결 | 프론트 |
| `src/components/ui` | Button, Input/Textarea, Field, Card/KeyValue, StatusBadge/ResultIcon/Alert, Chip/ReasonChip/Segment/OptionList, CheckRow, Sheet(바텀시트), Skeleton/Progress/Stepper/EmptyState | 프론트 |
| `src/components/layout` | Screen(화면 틀), BandHeader, BandHero, DemoStrip(체험 모드 띠), TabBar(홈·알림·내 정보), useFlow(`body[data-flow]`) | 프론트 |
| `src/routes` | 화면 ID ↔ 경로, 가드(RequireMember/RequireAdmin) | 프론트 |
| `src/data/index.ts` | **화면이 쓰는 훅의 유일한 진입점**. 지금은 `mock/`을 내보내고, 연결이 끝나면 `@/api`로 바꾼다 | 프론트(연결 작업이 바꿔도 됨) |
| `src/data/mock` | 화면 확인용 가짜 데이터·훅 (`src/api`와 같은 이름·모양) | 프론트 |
| `src/api`, `src/lib/http.ts`, `src/lib/auth.tsx`, `e2e/` | 실제 API 훅·토큰 | 연결 |
| `src/lib/building-suggest.ts` | F-02 건물 추천(EXIF → 위치 동의 시 브라우저 위치 → 직접). 좌표는 밖으로 안 나감 | 프론트 |

## 화면 ID ↔ 경로

| ID | 경로 | ID | 경로 |
|---|---|---|---|
| C-01 | `/` | L-05 | `/reports/:reportId` |
| C-02 | (바텀시트, F-01·C-03·L-02에서 엶) | L-06 | `/reports/:reportId/edit` |
| C-03 | `/demo` | L-07·L-08 | `/reports/:reportId/claim/:foundItemId` (판정 중 → 결과) |
| C-04 | `/notifications` | L-09 | `/claims/:attemptId/question` |
| C-05 | `/me` | L-10 | `/items/:foundItemId` |
| C-06 | `/status/:kind`, `*` | L-11 | `/items/:foundItemId/qr` |
| C-07 | `/map` | L-12 | `/items/:foundItemId/done` |
| F-01 | `/found/new` | A-01 | `/admin/login` |
| F-02 | `/found/new/details` | A-02 | `/admin` |
| F-03 | `/found/new/uploading` | A-03 | `/admin/items` |
| F-04 | `/found/new/result` | A-04 | `/admin/items/:id` |
| L-01 | `/login` | A-05 | `/admin/scan` |
| L-02 | `/signup` | A-06 | `/admin/hotspots` |
| L-03 | `/home` | | |
| L-04 | `/reports/new` | | |

## 수락 기준

### P1 뼈대 (2026-10-25)

| # | 기준 | 결과 |
|---|---|---|
| 1 | `npm run build -w frontend` 통과(tsc + vite + PWA sw/manifest 생성) | 통과 |
| 2 | `npm run typecheck -w frontend` 통과 (연결 작업의 `src/api`까지 포함) | 통과 |
| 3 | `npx biome check frontend`에서 프론트 소유 파일 오류 0 | 통과(고침: Tailwind 지시어용 `frontend/biome.json`, favicon title). 남은 오류는 `tokens.css`(디자인)·`src/api`(연결) 서식뿐 |
| 4 | 화면 ID 전부(C-01~07, F-01~04, L-01~12, A-01~06)에 경로가 있고 렌더된다 | 통과 (`routes.test.tsx` 28건) |
| 5 | 분실자 화면은 로그인 없으면 `/login`, 관리자 화면은 `/admin/login`으로 보낸다 | 통과 (테스트 2건) |
| 6 | 흐름 색 띠: 습득자 초록, 분실자 아이보리, 관리자 먹색 초록, 체험이면 맨 위 "체험 모드" 띠 | 통과 (스크린샷 확인) |
| 7 | 분실자 하단 탭 홈·알림·내 정보, 안 읽은 알림 점(+스크린리더 문구), 탭 높이 64px | 통과 |
| 8 | Pretendard 적용, 360px에서 가로 스크롤 없음, PC는 가운데 480px / 관리자 1200px | 통과 |
| 9 | PWA manifest(이름·색·아이콘 192/512/maskable), favicon·apple-touch-icon | 통과 (아이콘은 임시, P5에서 다듬음) |
| 10 | vitest + Testing Library 동작, F-02 건물 추천 로직(EXIF 우선·동의 없으면 위치 안 물음·먼 좌표 무시·결과에 좌표 없음) | 통과 (`building-suggest.test.ts` 5건, 전체 38건) |
| 11 | 터치 영역 44px: 아이콘 버튼·칩·체크 줄·옵션 줄 `min-h-touch`/`size-touch`, 포커스 링 2px | 통과(컴포넌트 기본값) |

### P2 배치 1 — C-01, C-02, C-03, F-01~F-04 (2026-10-25)

데이터: 화면은 `@/data`만 쓴다. 기본은 실제 서버 훅(`@/api`), `VITE_USE_MOCKS=true`면 가짜 훅. vitest는 가짜 훅으로 돈다(`vite.config.ts` `test.env`).
화면 확인용: 가짜 모드에서 사진 파일 이름에 `review`·`blank`(422)·`huge`(413)·`rate`(429)를 넣으면 그 결과가 나오고, `localStorage["chajeumpyo.mock.fail.demo"]="CAPTCHA_FAILED"`면 C-03이 실패한다. 개발 서버에서만 `/__dev/consent-member`(회원가입 동의 시트 미리보기).

| # | 기준 | 결과 |
|---|---|---|
| 1 | build·typecheck(루트 `npm run typecheck`가 frontend 포함)·biome(`frontend/` 전체) 통과 | 통과 |
| 2 | C-01 세 띠(초록 262·아이보리 246·베이지 나머지), 띠 전체가 링크, 관리자 로그인 44px 링크, PC는 띠가 화면 끝까지·글은 가운데 480 | 통과(고침: 아이보리 띠 세로 가운데, "심사위원용"을 제목 바로 위로) |
| 3 | C-02: 습득자·체험은 AI(필수)+위치(선택), 가입은 이메일(필수) 추가. 필수 미체크면 버튼 비활성+안내, 동의 버전 `CONSENT_VERSION`(2026-10-12) 표시, 버전 바뀌면 다시 물음 | 통과 (`consent-sheet.test.tsx` 4건) |
| 4 | C-03: 동의+캡차 전에는 시작 불가, 로딩 문구, 캡차 실패·429는 같은 자리 알림 하나+캡차 초기화, 성공하면 L-03 + 체험 모드 띠 | 통과 (`demo-start.test.tsx` 3건, 스크린샷) |
| 5 | F-01: 처음이면 동의 시트, 카메라(`capture=environment`)/앨범, 형식·10MB는 올리기 전에 검사, 미리보기(HEIC 미리보기 불가 시 대체 문구) | 통과 |
| 6 | F-02 건물 추천: EXIF → (위치 동의 시) 브라우저 위치 → 직접 고르기 시트. 출처 문구, 좌표는 브라우저 안에서만 쓰고 요청 본문에 없음 | 통과 (단위 테스트 5건 + 실서버 흐름에서 "지금 위치로 골랐어요"→청운관; 본문 좌표 없음은 연결 작업의 `found-items.test.ts`가 검사) |
| 7 | F-02: 층 칩(B1~15층, 다시 누르면 해제), 보관 2지선다, 보관처 목록(같은 건물 먼저+꼬리표), 캡차, 검증은 shared `RegisterFoundItemFields` | 통과 |
| 8 | F-03: 10초에 90%까지 가는 막대, 3단계 표시, 뒤로 가기 없음, 끝나면 F-04 | 통과(고침: 요청이 idle→pending 되기 전에 F-03이 먼저 그려져 F-01로 튕기던 경쟁 상태 → `submitted` 플래그) |
| 9 | F-04 7종: 등록됨 / 귀중품 그 자리(handOverAdvice) / 검토 대기(server message) / 422(다시 찍기, 입력 유지) / 429 / 413 / 그 밖의 오류. 습득자는 AI 결과를 고치지 않음 | 통과 (`finder-flow.test.tsx`: 검토 대기, 422 다시 찍기 후 건물·층·보관 유지) |
| 10 | 터치 44px(자동 검사: C-01, C-03, F-01, F-02, 건물 시트), 포커스 링, 상태는 아이콘+글자 | 통과(고침: `safe-bottom`이 `pb-5`를 덮어 하단 버튼이 화면 끝에 붙던 것, 시트 열 때 첫 입력 자동 포커스로 키보드가 올라오던 것) |
| 11 | 실제 서버(`npm run dev -w backend`)로 F-01→F-04 끝까지 | 통과 (등록됨·무선 이어폰·청운관 2층·종합서비스센터) |

### P3 배치 2 — L-01~L-12, C-04, C-05 (2026-10-25)

화면 확인용(가짜 모드): 후보 신고 `aaaaaaaa-…`(통과·질문·대면 확인), `bbbbbbbb-…`(실패·잠김), `cccccccc-…`(빈 목록). `localStorage["chajeumpyo.mock.reused"]="1"`이면 판정이 "이전 결과"로 와요. 답에 "나무"가 들어가면 통과. 비밀번호 `wrong-password`면 L-01 실패, 코드 `000000`이면 L-02 코드 틀림.

| # | 기준 | 결과 |
|---|---|---|
| 1 | build·루트 typecheck·`npx biome check frontend`·vitest 전부 통과 | 통과 (vitest 93건. 고침: 로딩 묶음 `role="status"`, 칩 묶음 `fieldset`, 타이머 `aria-label` 제거) |
| 2 | 모든 P3 화면이 실제 경로에 붙음, 탭 첫 화면(L-03·C-04·C-05)은 뒤로 가기 없음 | 통과 (`routes.test.tsx` 30건, `lost-flow.test.tsx` 탭 3건) |
| 3 | L-05 후보 카드에 색·브랜드·특징·점수·순위 없음, 썸네일 `blur(14px) grayscale(1)`, 최대 3개 | 통과 (`lost-flow.test.tsx`) |
| 4 | L-07 결과를 암시하지 않는 시간 기반 연출 → L-08 5종: 통과(맞은 항목은 서버 matchedFields만) / 질문 / 실패(남은 횟수만, 어느 항목인지 없음) / 잠김 / 대면 확인(409). "설명을 안 고치고 다시 누르면 횟수를 쓰지 않아요", 이전 결과 토스트 | 통과 (테스트 6건: 실패 화면에 특징·색 이름이 하나도 없음을 확인) |
| 5 | L-09 질문 1개, 한 번만 경고, 보내면 입력·버튼이 사라져 두 번 못 보냄 | 통과 (테스트 2건) |
| 6 | L-10 잠금 해제 연출(처음 한 번, 움직임 줄이기면 생략), 보관처/그 자리 분기, pickupNotice, 기록 안내 | 통과(고침: 연출이 "열리는 중"에서 멈추던 버그 — effect 의존성의 `phase` 때문에 끝 타이머가 지워짐. 연출 중에는 하단 버튼 숨김) |
| 7 | L-11 큰 QR·남은 시간·다시 받기(이전 QR 만료 확인 시트)·이미 수령됨, 코드 보기: 4자씩 띄우고 복사는 원래 토큰(대소문자 그대로) | 통과 (테스트: 28자 토큰, 묶음 ≤4, 복사 값 = 공백 없는 원문) |
| 8 | L-12 일반 / 체험 시연 / 그 자리 찾았어요 | 통과 (테스트: 체험 계정은 QR 대신 시연 완료, 그 자리 → 기록 완료) |
| 9 | L-02 5분 타이머, 다시 받기 대기 시간, 학교 도메인 아니면 오류 | 통과 (테스트 2건. 고침: 2·3단계 왼쪽 버튼을 X에서 디자인대로 뒤로 화살표로) |
| 10 | 360px 디자인 비교(batch2 PNG 32쌍), 터치 44px(P3 화면 15곳 자동 검사) | 통과(고침: L-09 질문 카드 크기·글자, 통과 화면 항목 칩 간격) |
| 11 | 실제 서버로 체험 흐름: 신고 → 후보 → 판정(질문) → 답 → 통과 → 공개 → 시연 수령 | 통과 ("검정 이어폰, 곰돌이 스티커" → "흠집은 어느 쪽에 있나요?" → "오른쪽 아래" → 통과 → 시연 완료). 워크트리 서버에는 사진 파일이 없어(`backend/uploads`는 원래 저장소에만) 공개 사진 자리는 "사진을 불러오지 못했어요"로 나옴 |

### P4 배치 3 — A-01~A-06 관리자 (2026-10-25)

화면 확인용(가짜 모드): 관리자 비밀번호 `wrong-password`면 A-01 실패. 습득물 `66666666-…`은 검토 대기, `33333333-…`은 대면 확인만(잠김), `44444444-…`은 수령 완료. A-05 직접 입력 코드에 `expired`·`claimed`·`other`가 들어가면 410·409·403. A-06 기간이 2020년이면 빈 집계.

| # | 기준 | 결과 |
|---|---|---|
| 1 | build·루트 typecheck·`npx biome check frontend`·vitest 전부 통과 | 통과 (vitest 108건, 관리자 15건 `src/pages/admin/admin-flow.test.tsx`. 고침: QR 스캔 쓸모없는 biome-ignore) |
| 2 | 관리자 경로는 지연 로드, 학생 세션이면 A-01로, PC(≥1024px) 왼쪽 내비·모바일 탭 4개 | 통과 (`routes.test.tsx` 관리자 6건이 실제 화면 문구로 확인) |
| 3 | A-03 목록은 원본 사진을 쓰지 않음(`listImageUrl`만, null이면 빈 상자), 상태 칩에 건수, 대면 확인만·시드 표시, PC는 표 | 통과 (테스트: 화면의 모든 `img` src가 원본이 아님. 실서버도 `…/public.jpg`만 확인) |
| 4 | A-04 대면 확인 블록은 `claimLockedAt` 있고 등록됨·열람됨일 때만, 메모 1~200자·글자 수·"신분증 번호 전체는 적지 마세요" | 통과 (조건 6가지 + 화면 3건) |
| 5 | A-04 검토 대기면 [저장하고 등록](status REGISTERED), 폼은 shared `AdminUpdateFoundItemRequest`로 검사 | 통과 (빈 종류·제목 막음, 빈 특징·같은 2순위 거절) |
| 6 | A-05 카메라는 이 화면에서만 불러옴, 못 쓰면 바로 직접 입력, 입력은 공백만 지움, 410·409·403 각각 안내 | 통과 (고침: 오류별 직원 안내 문구, 완료 화면을 시안대로 "수령 처리했어요 · 종류 · 가린 이메일 · 시각") |
| 7 | A-06 한 줄 요약·시드 집계 표시·건물/시간/종류 막대(툴팁)·[표로 보기]·기간 7/30/90/직접(1년 넘으면 오류)·빈 화면 | 통과 (고침: 실서버 요약이 "밤 12시~새벽 2시"인데 8~20시 막대엔 안 보여서, 그 밖 시간에 신고가 있으면 0~23시 전부. 다른 해 기간은 연도 표시) |
| 8 | 360px 디자인 비교(batch3 PNG 14쌍) + 1280px A-03·A-04 | 통과 (고침: `cn`이 `px-gutter`·`text-caption` 같은 테마 이름 값을 몰라 `p-0`이 안 먹고 글자 크기가 색과 섞여 지워지던 문제 — `extendTailwindMerge`로 등록. 하단 탭 글자가 시안 크기로 돌아옴. 속성 폼 선택 상자가 `read-only` 회색이던 것 흰 바탕으로, 검토 대기 빈 화면 문구, 로그인 실패 문구) |
| 9 | 터치 44px (A-01~A-06 9곳 자동 검사) | 통과, 예외 1: A-06 시간대 막대(폭 20px 이하). 같은 숫자를 [표로 보기]로 볼 수 있어(WCAG 2.5.8 같은 기능 예외) 그대로 둠 |
| 10 | 실서버 관리자 흐름: center@skuniv.ac.kr 로그인 → A-02 → A-03 → A-04 고치고 저장(PATCH 200, 화면에 반영) → A-06 | 통과 (브랜드를 바꿨다가 원래 값 Apple로 되돌림) |

### P5 배치 4 — C-06, C-07, PC 1280, PWA (2026-10-25)

화면 확인용: `/status/loading|offline|notfound|expired|expired-demo|ratelimit|server`(C-06 미리보기), 없는 주소는 404, `/login?expired=1|demo`는 만료 시트, `/map`은 캠퍼스 지도. 지도는 `VITE_NAVER_MAP_CLIENT_ID`가 있을 때만 불러와요(없으면 건물 목록).

| # | 기준 | 결과 |
|---|---|---|
| 1 | build·루트 typecheck·`npx biome check frontend`·vitest 전부 통과 | 통과 (vitest 122건. 고침: SVG 아이콘 3개 `<title>`, 쓸모없는 Fragment) |
| 2 | `cn` 고친 뒤 P2·P3 학생 화면 다시 비교(이전 구현 55장과 픽셀 비교 + batch1·2 시안) | 통과 — 바뀐 곳은 글자 크기가 시안대로 돌아온 것뿐(하단 탭 글자, F-02 위치 안내, L-11 남은 시간 칩). 날짜·시각 차이 말고는 다른 차이 없음 |
| 3 | C-06: 로딩 틀(300ms 안이면 안 보임, `aria-busy`), 오프라인(데이터 없으면 전체 화면, 있으면 토스트), 404, 로그인 만료 시트(체험이면 [체험 다시 시작하기]), 429 카운트다운 뒤 버튼 켜짐(Retry-After 없으면 30초), 500·502 | 통과 (`status-view.test.tsx` 7건. 고침: 버튼을 아래 고정 자리로, 본문·버튼이 같은 카운트다운) |
| 4 | C-07: 네이버 지도 v3를 지도 화면에서만 지연 로드, 건물 핀만(사용자 위치·물건 좌표 없음), 키 없음·`navermap_authFailure`·3초 넘김이면 건물 목록 | 통과 (`map.test.tsx` 7건: 스크립트 한 번, 인증 실패·시간 초과 실패, 키 없으면 스크립트 없음, 길찾기 주소에 좌표 없음) |
| 5 | C-07 위치: F-02 건물 시트(핀 ↔ 목록 양방향), L-10 작은 정적 지도(누르면 확대 시트) + 네이버 지도 길찾기, `/map` | 통과 (가짜 지도 스크립트로 핀 모양 확인. 보관처 건물은 안내 문구에 든 건물 이름으로 고름 — 질문 1) |
| 6 | PC 1280: C-01 띠는 화면 끝까지·글은 가운데 960·제목 40/50·화살표 56, 분실자·습득자는 띠·바탕 끝까지 + 내용 가운데 480, 768px 이상 하단 탭 대신 머리 띠 알림·내 정보, 후보 카드 확인 버튼 오른쪽 | 통과 (시안 PC 3장 비교) |
| 7 | PWA: `docs/design/system/icons` → `public/`, manifest 이름 찾음표·#1C4B34·#F6F2EA·maskable, apple-touch-icon 180, favicon svg·32 | 통과 (빌드한 `manifest.webmanifest` 확인) |
| 8 | 서비스 워커가 API 응답·`/files` 서명 사진을 캐시하지 않음 | 통과 — precache는 빌드 결과물만, `runtimeCaching: []`, 탐색 대체에서 `/api/`·`/files/` 제외. 빌드한 `sw.js`의 경로 등록은 NavigationRoute 하나뿐 |
| 9 | 덩어리 나누기: 관리자 화면·QR 리더·지도는 따로 | 통과 — 관리자·`@zxing`은 `assets/admin/`(학생 기기 precache에서도 뺌, 1.43MB → 0.92MB), 지도 `building-map` 4.3kB. 첫 화면 JS: index 573kB(gzip 179) + screen 262kB(gzip 82, 주로 zod 스키마) + utils 38kB + react-dom 4kB |
| 10 | 터치 44px (C-06 5종·C-01·L-10 지도·/map·L-05·L-03, 360과 1280) | 통과 — 지도 핀은 머리+꼬리+점 전체가 버튼(46×51 이상) |
| 11 | 연결 지적: A-04 기록 표 줄바꿈, 수령·만료 물건 속성 고치기 숨김, L-10 수령된 물건 안내 | 고침 |
