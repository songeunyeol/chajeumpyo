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
