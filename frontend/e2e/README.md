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

## 실행

```sh
# 1) DB + API(4100). 사진 서명 URL이 브라우저에서 닿도록 PUBLIC_BASE_URL을 맞춘다
npm run db:up
cd backend && PORT=4100 CORS_ORIGIN=http://localhost:5173 PUBLIC_BASE_URL=http://localhost:4100 \
  npx tsx --env-file-if-exists=../.env src/server.ts > /tmp/api.log 2>&1 &
# 2) 계약 확인 (저장소 루트에서. 가입 코드는 서버 로그에서 읽는다)
npx tsx frontend/e2e/contract-check.mts /tmp/api.log
# 3) 연결 단위 테스트 (frontend 폴더)
npx vitest run src/lib/http.test.ts src/lib/auth.test.tsx src/api
```

## 결과 기록

### I1 (10/25)

- 단위 테스트 22개 통과 (http 13, auth 7, 등록 본문 2).
- 계약 확인 94개 중 93개 통과. 실패 1: `/files/*` 응답의 `Cross-Origin-Resource-Policy: same-origin`(helmet 기본값) 때문에 5173 페이지의 `<img>`가 후보 썸네일·공개 사진을 못 띄운다 → I2에서 고침.
- 확인 메모: 가짜 AI로는 "확인 질문(BORDERLINE)"이 잘 안 나온다("흰색 이어폰 잃어버렸어요"도 FAIL). e2e에서 L-09는 다른 설명으로 찾거나 생략 사유를 남긴다.
