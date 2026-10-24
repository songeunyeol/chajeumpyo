# 연결 작업 수락 기준과 결과

실서버(백엔드 4100 + Vite 5173)에 붙여 확인한다. 단계(I1~I5)마다 다시 돌리고 결과를 아래에 쌓는다.

## 수락 기준

| # | 기준 | 확인 방법 |
|---|---|---|
| 1 | screens.md의 모든 화면 ID가 실제 엔드포인트(또는 API 없음)로 받쳐진다 | `src/api/README.md` 표 + `contract-check.mts` |
| 2 | 모든 응답이 `@chajeumpyo/shared` zod 스키마를 통과한다 | `contract-check.mts`(서버 응답 검증), `lib/http.ts`(앱에서 매 응답 검증) |
| 3 | 모든 에러 코드(`ERROR_STATUS` + 브라우저 코드 3개)에 한국어 문구가 있다 | `lib/errors.ts` `ERROR_MESSAGES`(Record라 빠지면 타입 오류) + `CLIENT_ERROR_MESSAGES` |
| 4 | 습득물 등록 요청에 좌표가 없다(필드·EXIF 모두) | `api/found-items.test.ts`, e2e (a)에서 `POST /found-items` 가로채기 |
| 5 | 토큰은 URL·쿼리에 절대 없다(헤더로만) | `lib/http.test.ts`, e2e에서 모든 요청 URL 검사 |
| 6 | 401(토큰 보낸 요청) → 그 세션만 지우고 로그인 만료 화면으로. 로그인 실패 401은 세션을 건드리지 않음 | `lib/http.test.ts`, `lib/auth.test.tsx` |
| 7 | CORS: 5173에서 preflight(multipart + `X-Captcha-Token`, PATCH + Authorization) 통과, 다른 출처 거부 | `contract-check.mts` |
| 8 | 서명 사진 URL(후보 썸네일·공개 사진·관리자 원본)이 5173 페이지의 `<img>`로 보인다 | `contract-check.mts`(CORP 헤더), e2e 스크린샷 |
| 9 | 후보 화면 DOM에 색·점수·특징이 없고 최대 3개, 실패 화면에 맞은/틀린 항목이 없다 | `contract-check.mts`(응답), e2e (b)(d)(DOM) |
| 10 | e2e (a)~(f) 통과, 백엔드 테스트 전부 통과, `npx biome check frontend backend packages` 깨끗 | 단계별 실행 기록 |

## e2e 실행 (Playwright 1.48.2)

```sh
npm run db:up                    # Docker DB
npx -y playwright@1.48.2 install chromium   # 처음 한 번
npm run e2e -w frontend          # = playwright test (frontend 폴더)
```

- `playwright.config.ts`가 서버 둘을 새로 띄운다: API **4200**(`e2e/start-api.mts`: e2e DB 비우기 → API → `seed:dev`), Vite **5174**(`VITE_API_BASE=http://localhost:4200/api/v1`). 개발용 4100·5173과 겹치지 않아 같이 돌려도 된다. 매번 새 프로세스라 메모리 요청 제한도 초기화된다.
- 결과: `e2e/.artifacts/`(커밋 안 함) — `screens/*.png` 단계별 화면, `test-results/**/trace.zip`(실패 시), `report/`(HTML), `api.log`(서버 로그, 가입 코드 포함).
- 크롬은 Blob이 든 multipart 본문을 Playwright에 주지 않는다(`request.postDataBuffer()`가 null). 그래서 등록 본문은 `captureFormData`(helpers.ts)가 페이지의 `fetch`를 감싸 **네트워크로 넘기기 직전의 FormData**(필드 이름·값·사진 바이트)를 기록해 검사한다.

## 개발 API를 이 작업 폴더에서 띄우기 (사진 폴더)

사진 파일은 DB가 아니라 `STORAGE_LOCAL_DIR`(기본 상대 경로 `uploads`, **그 서버의 `backend/` 기준**)에 있다. 그래서 git worktree처럼 다른 폴더에서 띄운 서버가 같은 개발 DB를 쓰면, 다른 폴더의 서버가 올린 사진은 `/files/*`에서 404가 난다.

```sh
# 레포 루트에서. 포트 4100, CORS 5173, PUBLIC_BASE_URL은 늘 http://localhost:4100 (셸·.env의 다른 값 무시)
STORAGE_LOCAL_DIR=/절대/경로/chajeumpyo/backend/uploads npx tsx frontend/e2e/start-dev-api.mts
# 이 폴더 사진만 쓸 때는 STORAGE_LOCAL_DIR 없이
```

- `STORAGE_LOCAL_DIR`는 절대 경로만 받는다(상대 경로면 멈춤). 경로는 커밋하지 말고 셸에서만 넘긴다.
- 사진은 한 폴더에만 쌓인다. 폴더를 바꾸기 전에 이 서버로 올린 물건은 새 폴더에 사진이 없어 404가 날 수 있다.
- 포트·출처는 `DEV_API_PORT`, `DEV_CORS_ORIGIN`으로 바꾼다.
- e2e(`start-api.mts`)는 e2e DB 전용 임시 폴더(`$TMPDIR/chajeumpyo-e2e-uploads`)를 쓴다. 바꾸려면 `E2E_STORAGE_DIR`(절대 경로).

- 더미 습득물은 지금 기준 최근에 주운 것으로 들어간다(`backend/scripts/seed-dates.ts`). 개발 DB가 오래돼 '오늘' 신고에 후보가 안 나오면 `npm run seed:dev -w backend -- --refresh-dates` — 보관 중인 더미 습득물의 `found_at`·`expires_at`만 고친다(API 서버 불필요, 몇 번 돌려도 같음).

## 계약 확인·단위 테스트

```sh
# 1) DB + API(4100). 사진 서명 URL은 개발에서 자동으로 http://localhost:${PORT}
npm run db:up
cd backend && PORT=4100 CORS_ORIGIN=http://localhost:5173 \
  npx tsx --env-file-if-exists=../.env src/server.ts > /tmp/api.log 2>&1 &
PORT=4100 npm run seed:dev -w backend   # 개발 DB에 더미 데이터(이미 있으면 건너뜀)
# 2) 계약 확인 (저장소 루트에서. 가입 코드는 서버 로그에서 읽는다)
npx tsx frontend/e2e/contract-check.mts /tmp/api.log
# e2e 전용 DB(chajeumpyo_e2e) 만들기·마이그레이션·비우기 (개발 DB는 건드리지 않음)
npx tsx frontend/e2e/e2e-db.mts
# 3) 연결 단위 테스트 (frontend 폴더)
npx vitest run src/lib/http.test.ts src/lib/auth.test.tsx src/api
```

## 결과 기록

### I1 (10/25)

- 단위 테스트 22개 통과 (http 13, auth 7, 등록 본문 2).
- 계약 확인 94개 중 93개 통과. 실패 1: `/files/*` 응답의 `Cross-Origin-Resource-Policy: same-origin`(helmet 기본값) 때문에 5173 페이지의 `<img>`가 후보 썸네일·공개 사진을 못 띄운다 → I2에서 고침.
- 확인 메모: 가짜 AI로는 "확인 질문(BORDERLINE)"이 잘 안 나온다("흰색 이어폰 잃어버렸어요"도 FAIL). e2e에서 L-09는 다른 설명으로 찾거나 생략 사유를 남긴다.

### I2 (10/25)

- 백엔드 고침: `/files/*` 응답만 `Cross-Origin-Resource-Policy: cross-origin`(나머지는 helmet 기본 same-origin), `PUBLIC_BASE_URL` 개발 기본값 `http://localhost:${PORT}`(production은 필수), 관리자 목록 `thumbnailUrl`(공개본 서명 링크 10분, 원본 없음, 지운 물건 null). 테스트 5개 추가, 백엔드 296개 통과(기준 291).
- 계약 확인 97/97 통과(PUBLIC_BASE_URL 없이 띄운 4100 서버). 확인 질문 경로가 가짜 AI로 늘 같게 나온다: 설명 "검정 이어폰, 곰돌이 스티커"(스티커 일치 + 색 모순) → BORDERLINE "흠집은 어느 쪽에 있나요?" → 답 "오른쪽 아래" → PASS. 테스트용 스위치는 필요 없었다.
- 개발 데이터 스크립트를 `backend/scripts/seed-dev.ts`(`npm run seed:dev -w backend`)로 옮김. production·`*_test` DB면 DB 모듈을 불러오기 전에 멈춘다. 빈 e2e DB에서 전체(건물 6·보관처 3·관리자 2·습득물 7) 확인.
- e2e DB 준비 스크립트 `e2e-db.mts`: 이름을 `current_database()`로 다시 확인한 뒤에만 비운다.
- biome: 연결·백엔드·shared 깨끗. `frontend/src/routes/index.tsx`(프론트 파일) 서식 1건 남음.

### I3 (10/25)

- 관리자 목록 사진 필드 이름 `thumbnailUrl` → `listImageUrl`(상세는 `thumbnailUrl` = 후보용 블러본 그대로). 백엔드 296개 통과.
- 배치 1 연결 확인: `src/data/index.ts`가 실서버에서 `@/api` 훅을 고르고, `main.tsx`가 `ApiProvider`(만료 시 라우터 이동)로 감싼다. 습득 등록은 `useRegisterFoundItem` → `buildRegisterForm`.
- e2e (a) 2/2 통과 (9.4초):
  1. 보관처에 맡김: GPS EXIF가 든 사진 → F-02가 "유담관 · 사진 위치로 골랐어요" → 유담관 경비실 → 등록 201 → "등록됐어요". 등록 FormData 필드가 정확히 `image·buildingId·storageType·storagePlaceId·consentVersion·consentExternalAi·consentLocation`이고 좌표 이름 필드 없음, 텍스트 값에 좌표 숫자 없음, 사진은 JPEG이고 EXIF 블록 없음(원본에는 있음을 먼저 확인), 캡차는 헤더, 모든 API·사진 요청 URL에 토큰·좌표 없음.
  2. 그 자리에 둔 고가품: `storagePlaceId` 없음, 좌표 없음 → "가까운 보관처에 맡겨 주세요" 안내.
- 검사가 실제로 잡는지 확인(뮤테이션): `buildRegisterForm`에 `lat` 필드를 넣으면 두 테스트 모두 실패, EXIF 제거를 건너뛰면 `hasExif` 단언에서 실패. 확인 뒤 원래대로 되돌림.
- `tester/` 폴더와 biome의 `"!tester"` 삭제(#31). biome은 `**/e2e/.artifacts`만 추가로 제외.

### I4 (10/25)

- 분실자 화면(L-01~L-12, C-03)은 `@/data`로만 훅을 가져오고, `VITE_USE_MOCKS`가 `"true"`가 아니면 `@/api` 실제 훅(`src/data/index.ts` `pick`). e2e Vite는 `VITE_USE_MOCKS=false`.
- e2e 7/7 통과, 연속 3번(38.2s·35.8s·33.5s). 매 실행 새 API라 체험 로그인 4번(제한 5/10분)은 안에 든다.
  - (b) `b-demo-flow`: C-01 → C-03(AI 동의 + 개발 캡차) → L-03(체험 띠) → L-04 "흰 이어폰, 곰돌이 스티커" → L-05 후보 1개(≤3): 후보 영역 글에 저장 특징·색·브랜드·점수 없음, 신고 요약(내 설명)을 뺀 body HTML(속성 포함)에도 없음, 썸네일 computed `filter`에 `blur(14px)`·`grayscale(1)` → L-08 통과 → L-10 사진 로드(naturalWidth>0)·블러 풀림·"유담관 경비실" → L-11 → L-12 "시연: 보관처에서 수령 처리됨". 모든 요청 URL에 토큰·좌표 없음.
  - (c) `c-signup`: gmail → "학교 이메일(@skuniv.ac.kr)만 쓸 수 있어요."(요청 안 나감) → 학교 메일 → API 로그에서 코드 → 동의 시트 → 비밀번호 → L-03 회원(체험 띠 없음), 새로고침 뒤에도 로그인.
  - (d) `d-fail-question`: "빨간 이어폰, 고양이 키링" → FAIL 응답 키가 정확히 `attemptId·attemptsLeft·inPersonOnly·result·reused`, 화면 "3번 중 2번", body 글·HTML에 저장 특징 없음 → 설명 그대로 다시 → `reused:true`, 알림 "이전 결과예요…", 여전히 2번. "검정 이어폰, 곰돌이 스티커" → 질문 "흠집은 어느 쪽에 있나요?"(화면에 답 없음) → "오른쪽 아래" → 통과, 같은 토큰으로 두 번째 답 → 409 `ALREADY_ANSWERED`. 후보 화면에서 시연 이어폰 `claim_locked_at`을 SQL로 설정(이름 확인 후) → 확인 → 409 `IN_PERSON_REQUIRED` → "보관처에서 직접 확인해요", 목록 카드 "대면 확인만"·확인 버튼 없음. 끝나면 잠금 해제.
- 찾은 프론트 버그: L-10 잠금 해제 연출이 `opening`에서 멈춰 사진이 흐린 채로 남음 → 프론트가 db5fce2에서 고침. 그 뒤 (b)는 연출 끝에 블러가 풀리는지 엄격하게 확인하고, 전체 7/7을 2번 더 통과(33.4s·33.4s).
- 설정 고침: Vite를 `npx` 대신 `node ../node_modules/vite/bin/vite.js`로 띄움(npx 자식이 남아 다음 실행이 5174 충돌).
- 백엔드 296개 통과(변경 없음), `npx biome check frontend backend packages` 깨끗, `tsc -p frontend/e2e` 통과.
- 확인 안 한 것: 서버 쪽 `INVALID_EMAIL_DOMAIN`(화면이 먼저 막아 요청이 안 나감 — 계약 확인에서 따로 본다), 실제 QR 스캔 수령(L-11 회원 → A-05, 관리자 화면이 아직 자리표시).
