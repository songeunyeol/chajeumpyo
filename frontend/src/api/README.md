# src/api — 백엔드 연결 훅

화면은 `@/api`(또는 지금처럼 `@/data`)에서 훅만 가져다 쓴다. fetch를 직접 부르지 않는다.
훅 이름·입력 모양은 `src/data/mock/hooks.ts`(프론트 작업의 가짜 훅)와 같다. 그래서 `src/data/index.ts`만 바꾸면 실제 서버로 붙는다:

```ts
// src/data/index.ts (실서버)
export * from "@/api";
export type { AdminListParams, HotspotParams } from "./types";
```

앱 최상단은 `<ApiProvider>` 하나로 감싼다(QueryClient + 로그인 세션). `onExpired`에 라우터 이동을 넘기면 401 때 새로고침 없이 로그인 화면으로 간다.

```tsx
<ApiProvider onExpired={({ scope, demo }) => router.navigate(`${scope === "admin" ? "/admin/login" : "/login"}?expired=${demo ? "demo" : "1"}`)}>
```

## 구성

| 파일 | 내용 |
|---|---|
| `lib/http.ts` | `request()`: 기본 주소(`VITE_API_BASE`), JSON·multipart, Bearer 토큰, 서버 오류 → `ApiError{code,status,message,details}`, 응답 zod 검증, 시간 제한(기본 15초, AI 요청 30초), 401 → 세션 지우고 만료 처리 |
| `lib/auth.tsx` | 세션 저장소(회원 `member` = USER·DEMO / 관리자 `admin` 따로), localStorage(try/catch), 만료 타이머, 다른 탭 동기화, `AuthProvider`·`useAuth`·`maskEmail` |
| `api/provider.tsx` | `ApiProvider`, 재시도 규칙(4xx 재시도 없음), 세션이 바뀌면 그 범위 캐시 삭제 |
| `api/keys.ts` | 캐시 키 `qk` (`public`·`member`·`admin` 접두어) |
| `api/image.ts` | `prepareUploadImage`: 캔버스로 다시 그려 EXIF(GPS) 제거 + 2048px로 줄임 |

오류 문구: 서버 코드는 `lib/errors.ts`의 `ERROR_MESSAGES`/`errorMessageOf(err)`가 그대로 읽는다(`err.code`, `err.status`). 브라우저에서만 생기는 코드 `NETWORK_ERROR`·`TIMEOUT`·`INVALID_RESPONSE`는 `CLIENT_ERROR_MESSAGES`. 폼 필드 오류는 `err.fieldErrors()` → `setError`.

## 훅 ↔ API ↔ 화면

| 훅 | API | 화면 | 메모 |
|---|---|---|---|
| `useSession(scope?)` | — | 전 화면, 가드 | `{user,isDemo,isAdmin,storagePlace}`. scope 생략 시 주소가 `/admin…`이면 관리자 세션 |
| `useLogout()` | — | C-05, 관리자 | `logout(scope?)`. 서버 호출 없음, 그 범위 캐시 삭제 |
| `useLogin()` | `POST /auth/login` | L-01 | 틀리면 `UNAUTHORIZED`(세션 만료로 처리하지 않음) |
| `useRequestEmailCode()` | `POST /auth/email/code` | L-02 ① | `{email, captchaToken?}` → `{sent:true}`. 60초 재발송 대기 `RATE_LIMITED`, 다른 도메인 `INVALID_EMAIL_DOMAIN`, 코드 5분 |
| `useVerifyEmailCode()` | `POST /auth/email/verify` | L-02 ② | `INVALID_CODE`, 5회 틀리면 다시 받기 |
| `useSignup()` | `POST /auth/signup` | L-02 ③ | `{verificationToken,password,consent: MemberConsent}` → 바로 로그인. `EMAIL_TAKEN` |
| `useDemoLogin()` | `POST /auth/demo` | C-03 | `{consent: DemoConsent, captchaToken?}`. IP당 10분 5회 |
| `useAdminLogin()` | `POST /admin/auth/login` | A-01 | 관리자 세션에 저장(`storagePlace` 포함) |
| `useMe()` | `GET /me` | C-05 | 회원만(관리자 토큰은 403) |
| `useBuildings()` | `GET /buildings` | F-02, L-04, C-07 | `{buildings}`(좌표 포함, 브라우저 안에서만 사용) |
| `useStoragePlaces(buildingId?)` | `GET /storage-places` | F-02 | `{storagePlaces}`, 같은 건물 먼저 |
| `useRegisterFoundItem()` | `POST /found-items` (multipart) | F-02→F-03→F-04 | 아래 "등록" 참고 |
| `useLostReports()` | `GET /lost-reports` | L-03 | `{reports}` |
| `useLostReport(id)` | (목록에서 고름) | L-05 상단, L-06 | 단건 API 없음 |
| `useCreateLostReport()` | `POST /lost-reports` | L-04 | 응답 후보를 L-05 캐시에 넣음. 실제 AI는 수 초 |
| `useCandidates(reportId)` | `GET /lost-reports/:id/candidates` | L-05 | `{candidates}` 최대 3, 최신순. 썸네일 서명 URL 10분 → 8분마다 새로 받음 |
| `useUpdateLostReport(reportId)` | `PATCH /lost-reports/:id` | L-06 | `{description}` 또는 `{status:"CLOSED"}` |
| `useClaim(reportId)` | `POST /lost-reports/:id/claims` | L-05→L-07→L-08 | `mutate({foundItemId})`. PASS/BORDERLINE/FAIL, `MATCH_LOCKED`, `IN_PERSON_REQUIRED`, `ALREADY_CLAIMED`. 끝나면 후보 다시 받음 |
| `useAnswer(attemptId)` | `POST /claims/:attemptId/answer` | L-09 | `mutate({answer})`. 한 번만(`ALREADY_ANSWERED`) |
| `useFoundItemDetail(id)` | `GET /found-items/:id/detail` | L-10 | 볼 때마다 열람 기록 → 자동 새로고침·재시도 끔. 통과 전 `FORBIDDEN` |
| `useIssuePickupQr(id)` | `POST /found-items/:id/pickup-qr` | L-11 | `mutate()`. `CENTER_QR`(qrToken, 24시간) / 체험은 `DEMO`(바로 완료 → L-12) |
| `useSelfPickup(id)` | `POST /found-items/:id/self-pickup` | L-12 | `mutate()`. 그 자리 물건만(보관처 물건은 `INVALID_STORAGE_TYPE`) |
| `useNotifications(scope?)` | `GET /notifications` | C-04, 탭 점 | 1분마다. 회원·관리자 공용 |
| `useMarkNotificationRead(scope?)` | `PATCH /notifications/:id/read` | C-04 | 낙관적 갱신 |
| `useMarkAllNotificationsRead(scope?)` | `PATCH /notifications/read-all` | C-04 | |
| `useAdminFoundItems({status,page})` | `GET /admin/found-items` | A-02(counts), A-03 | 20개씩, 이전 페이지 유지 |
| `useAdminFoundItem(id)` | `GET /admin/found-items/:id` | A-04 | 원본·공개본·블러 URL, 기록 |
| `useUpdateAdminFoundItem(id)` | `PATCH /admin/found-items/:id` | A-04 | 검토 대기 → `{..., status:"REGISTERED"}` |
| `useInPersonPickup(id)` | `POST /admin/found-items/:id/in-person-pickup` | A-04 | `{verificationNote}` ≤200자. 대면 확인 물건이 아니면 `NOT_IN_PERSON_ITEM` |
| `useScanPickup()` | `POST /admin/pickups/scan` | A-05 | `mutate({qrToken})`. `QR_EXPIRED` 410, `ALREADY_CLAIMED` 409, `FORBIDDEN` 다른 보관처, `NOT_FOUND` 없는 토큰 |
| `useCompletePickup()` | `POST /admin/pickups/:id/complete` | A-05 | `mutate({pickupId})` |
| `useHotspots({from?,to?})` | `GET /admin/stats/hotspots` | A-02, A-06 | `isSeedData`면 "시드 집계" 배지 |

## 등록 (`useRegisterFoundItem`)

```ts
mutate({ image: file, buildingId, storageType, storagePlaceId?, floor?, consent: { version, externalAi, location }, captchaToken })
```

- 본문(`buildRegisterForm`)에는 건물 id·보관·층·동의만 들어간다. **좌표 필드는 없다**(B14). 사진은 보내기 전에 캔버스로 다시 그려 EXIF GPS도 빠진다. 건물 추천용 EXIF는 그 전에 원본에서 읽는다(`lib/building-suggest.ts`). 이미 줄였으면 `prepared: true`.
- 결과 `status: "REVIEW"`면 F-04 검토 대기(`message`). `handOverAdvice`가 있으면 "보관처에 맡겨 주세요" 안내.
- 오류: `NO_OBJECT_DETECTED`(422) 다시 찍기, `IMAGE_TOO_LARGE`(413), `RATE_LIMITED`(429, 10분 5건), `AI_UNAVAILABLE`(502), `CAPTCHA_FAILED`, `TIMEOUT`(30초).

## 실제 AI(Gemini) 시간

지금 서버는 `AI_MODE=mock`이라 즉시 답한다. 실제 AI는 등록·신고·판정이 각각 수 초(최대 약 10초) 걸리고, 실패하면 `AI_UNAVAILABLE`(502)이거나 등록이 `REVIEW`로 끝난다. F-03·L-07 대기 화면은 10초 이상 버티게 만들고, 신고 작성(L-04)은 실패해도 입력을 지우지 않는다.

## 테스트

`npx vitest run src/lib/http.test.ts src/lib/auth.test.tsx src/api` (frontend 폴더)
