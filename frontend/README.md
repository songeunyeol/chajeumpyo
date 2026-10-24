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

환경 변수는 `.env.example` 참고: `VITE_API_BASE`(기본 `http://localhost:4100/api/v1`), `VITE_TURNSTILE_SITE_KEY`, `VITE_NAVER_MAP_CLIENT_ID`.

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
