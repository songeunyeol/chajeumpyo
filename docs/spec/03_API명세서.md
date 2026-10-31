# API 명세서

> 상태: 초안 (2026-10-11, 검토 반영 2026-10-11). 기준 스택: TypeScript + Express.
> 연관 문서: [기능 명세서](./01_기능명세서.md) · [ERD](./02_ERD.md) · [검토 이력](../open-issues.md)
> 요청·응답 스키마의 코드 기준은 `packages/shared`(zod)이고, 서버 실행 중 `/api/docs`에서 OpenAPI 문서를 볼 수 있다.

## 1. 공통

- **Base URL**: `/api/v1`
- **인증**: `Authorization: Bearer <accessToken>` (JWT). 습득물 등록과 건물 조회는 인증이 필요 없다.
- **권한 표기**: `공개` 누구나 · `회원` 분실자·체험 계정 · `관리자` 관리자 계정
- **시간**: ISO 8601, 한국 시간 기준으로 표시는 프론트에서 처리
- **이미지 URL**: 비공개 사진은 만료 시간이 있는 서명 URL로 내려준다. (초안: 10분)
- **캡차**: 습득물 등록, 체험 로그인, 인증 코드 요청은 Cloudflare Turnstile 토큰을 `X-Captcha-Token` 헤더로 보낸다. 없거나 틀리면 `400 CAPTCHA_FAILED`. 서버는 Turnstile 검증 결과의 `success`뿐 아니라 `hostname`(허용 호스트: `TURNSTILE_HOSTNAMES`, 없으면 `PUBLIC_BASE_URL`의 호스트. production이 아니고 localhost면 생략)과 위젯 `action`(습득물 분석·등록 `found-analyze`, 인증 코드 요청 `email-code`, 체험 로그인 `demo-login`)도 확인해, 다르면 같은 오류를 낸다. 개발 환경에서는 `CAPTCHA_MODE=off`로 끌 수 있고 production에서는 끌 수 없다. 위젯에 쓸 사이트 키와 캡차 방식은 `GET /config`로 받는다. (open-issues #38)
- **동의**: 가입·체험 로그인·습득물 등록은 동의 화면 버전(`CONSENT_VERSION`, `packages/shared/src/api/consent.ts`)과 동의 항목을 같이 보낸다. 버전이 다르거나 필수 항목(가입: 이메일 수집·외부 AI 처리, 체험·등록: 외부 AI 처리)이 빠지면 `400 VALIDATION_ERROR`. 동의 문구도 같은 파일의 `CONSENT_TEXTS`를 쓴다. (QA B15, open-issues #35)

### 에러 응답 형식

```json
{
  "error": {
    "code": "MATCH_LOCKED",
    "message": "이 물건은 확인 시도 횟수를 모두 사용했어요."
  }
}
```

### 에러 코드

| HTTP | code | 상황 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 입력 형식 오류 |
| 400 | `INVALID_EMAIL_DOMAIN` | 학교 이메일이 아님 |
| 400 | `INVALID_CODE` | 인증 코드 불일치·만료 |
| 400 | `CAPTCHA_FAILED` | 캡차 토큰이 없거나 틀림, 캡차 검증 서버 오류 |
| 400 | `VALUABLE_HAND_OVER_REQUIRED` | AI가 귀중품으로 본 물건을 `IN_PLACE`(그 자리에 둠)로 등록하려 함. 보관처(`HANDED_OVER`)만 받는다 (QA B11) |
| 401 | `UNAUTHORIZED` | 토큰 없음·만료 |
| 403 | `FORBIDDEN` | 권한 없음 (일치 판정을 통과하지 않은 습득물 상세 조회, 후보가 아닌 습득물에 판정 시도, 다른 보관처 물건 수령 처리 등) |
| 404 | `NOT_FOUND` | 대상 없음 |
| 409 | `MATCH_LOCKED` | 이 계정의 시도 횟수(3회) 초과로 잠김 |
| 409 | `IN_PERSON_REQUIRED` | 모든 계정의 실패가 10회가 되어 이 물건은 대면 확인만 됨 |
| 409 | `ALREADY_CLAIMED` | 이미 수령 완료된 물건 |
| 409 | `ALREADY_ANSWERED` | 이미 답한 확인 질문 |
| 409 | `INVALID_STORAGE_TYPE` | 보관 위치와 맞지 않는 수령 방식 |
| 409 | `ALREADY_CONFIRMED` | 두 단계 등록에서 이미 확정한 물건을 다시 확정 |
| 409 | `NOT_IN_PERSON_ITEM` | 대면 확인으로 넘어간 보관 중 물건이 아니라 대면 확인 수령을 할 수 없음 |
| 410 | `QR_EXPIRED` | 수령 QR 만료 |
| 413 | `IMAGE_TOO_LARGE` | 사진 용량 초과 |
| 422 | `NO_OBJECT_DETECTED` | 사진에서 물건을 찾지 못함 |
| 429 | `RATE_LIMITED` | 등록·요청 과다 |
| 500 | `INTERNAL_ERROR` | 서버 오류 |
| 502 | `AI_UNAVAILABLE` | AI 호출 실패로 저장하지 못함 (분실 신고 추출 실패 등). 습득물 등록은 실패해도 `201 REVIEW`로 응답한다 |

---

## 2. 엔드포인트 목록

| 메서드 | 경로 | 권한 | 기능 ID |
| --- | --- | --- | --- |
| GET | `/config` | 공개 | F-01, F-04, F-05 (캡차 설정) |
| GET | `/buildings` | 공개 | F-01 |
| GET | `/storage-places` | 공개 | F-01 |
| GET | `/files/*` | 서명 URL | F-10, F-14 |
| POST | `/found-items` | 공개 | F-01, F-02, F-03 |
| POST | `/found-items/analyze` | 공개 | F-01, F-02, F-03 (두 단계 등록 1) |
| POST | `/found-items/:id/confirm` | 공개(확정 토큰) | F-01 (두 단계 등록 2) |
| POST | `/auth/email/code` | 공개 | F-04 |
| POST | `/auth/email/verify` | 공개 | F-04 |
| POST | `/auth/signup` | 공개 | F-04 |
| POST | `/auth/login` | 공개 | F-04 |
| POST | `/auth/demo` | 공개 | F-05 |
| GET | `/me` | 회원 | F-04 |
| POST | `/lost-reports` | 회원 | F-06, F-07 |
| GET | `/lost-reports` | 회원 | F-06 |
| GET | `/lost-reports/:id/candidates` | 회원 | F-07 |
| PATCH | `/lost-reports/:id` | 회원 | F-06 |
| POST | `/lost-reports/:id/claims` | 회원 | F-08 |
| POST | `/claims/:attemptId/answer` | 회원 | F-09 |
| GET | `/found-items/:id/detail` | 회원 | F-10, F-12 |
| POST | `/found-items/:id/pickup-qr` | 회원 | F-11 |
| POST | `/found-items/:id/self-pickup` | 회원 | F-11 |
| GET | `/notifications` | 회원·관리자 | F-13 |
| PATCH | `/notifications/:id/read` | 회원·관리자 | F-13 |
| PATCH | `/notifications/read-all` | 회원·관리자 | F-13 |
| POST | `/admin/auth/login` | 공개 | F-14 |
| POST | `/admin/pickups/scan` | 관리자 | F-11, F-14 |
| POST | `/admin/pickups/:id/complete` | 관리자 | F-11, F-14 |
| GET | `/admin/found-items` | 관리자 | F-14 |
| GET | `/admin/found-items/:id` | 관리자 | F-14 |
| PATCH | `/admin/found-items/:id` | 관리자 | F-14 |
| POST | `/admin/found-items/:id/in-person-pickup` | 관리자 | F-11, F-14 |
| GET | `/admin/stats/hotspots` | 관리자 | F-15 |

---

## 3. 상세

### 공개 설정

#### `GET /config` · 공개
프론트가 화면을 그리기 전에 읽는 공개 설정. 지금은 캡차 설정만 있다.

```json
{ "captcha": { "mode": "turnstile", "siteKey": "0x4AAAAAAA..." } }
```
- `mode`: `off`(개발. 서버가 토큰을 검사하지 않음) 또는 `turnstile`(Cloudflare Turnstile).
- `siteKey`: Turnstile 위젯용 **공개** 사이트 키(`TURNSTILE_SITE_KEY`). `off`면 `null`. 비밀 키(`TURNSTILE_SECRET_KEY`)는 내려주지 않는다.
- 프론트 동작: `turnstile`일 때만 `https://challenges.cloudflare.com/turnstile/v0/api.js`를 불러 위젯을 그리고, 받은 토큰을 `X-Captcha-Token`으로 보낸다. 토큰은 한 번만 쓸 수 있고 약 5분 뒤 만료되므로 만료되면 위젯이 새로 받는다. `off`면 스크립트를 부르지 않고 개발용 토큰 `dev-pass`를 보낸다.
- `CAPTCHA_MODE=turnstile`이면 `TURNSTILE_SECRET_KEY`와 `TURNSTILE_SITE_KEY`가 둘 다 있어야 서버가 뜬다.
- 응답은 `Cache-Control: public, max-age=60`.

### 건물

#### `GET /buildings` · 공개
건물 목록과 건물 중심 좌표(공개 정보).

```json
{ "buildings": [ { "id": 1, "name": "혜인관", "lat": 37.615, "lng": 127.013 }, { "id": 2, "name": "청운관", "lat": 37.616, "lng": 127.012 } ] }
```
- **사용자 좌표는 서버로 보내지 않는다** (open-issues #34, QA B14). 프론트가 사진 GPS(EXIF) → 브라우저 위치 순으로 좌표를 얻어 `packages/shared`의 `nearestBuilding()`으로 브라우저 안에서 건물을 고르고(300m 넘으면 목록에서 고름), 좌표는 버린다. 업로드 전 canvas로 다시 인코딩해 EXIF를 지운다.
- 예전 `GET /buildings/nearest`는 없앴다.

#### `GET /storage-places?buildingId=1` · 공개
활성 보관처 목록. `buildingId`를 주면 그 건물 보관처가 앞에 온다(`sameBuilding: true`).

```json
{
  "storagePlaces": [
    { "id": 3, "name": "혜인관 경비실", "building": { "id": 1, "name": "혜인관" }, "org": "GUARD", "guideText": "혜인관 1층 정문 옆 경비실", "sameBuilding": true },
    { "id": 1, "name": "종합서비스센터", "building": { "id": 2, "name": "청운관" }, "org": "CENTER", "guideText": "청운관 1층 종합서비스센터", "sameBuilding": false }
  ]
}
```

### 습득물 등록

#### `POST /found-items` · 공개 · `multipart/form-data`
| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `image` | file | O | 사진 1장 |
| `buildingId` | number | `IN_PLACE`면 O | 주운 건물. `HANDED_OVER`면 모를 때 비운다(보관처 건물로 채우지 않는다. 매칭의 "같은 건물" 점수가 틀어지므로) |
| `storageType` | `IN_PLACE` \| `HANDED_OVER` | O | 보관 위치 (그 자리에 둠 / 보관처에 맡김) |
| `storagePlaceId` | number | `HANDED_OVER`면 O | 보관처 |
| `floor` | number | X | 습득 층. 지하는 음수(B1 = -1), -10~30 |
| `locationDetail` | string | X | 자세한 위치 (예: 3층 엘리베이터 앞 벤치 위). 200자 이내, 앞뒤 공백을 지우고 빈 값은 없는 것으로 본다. 판정 통과 후 상세에서만 보인다 |

**처리**: 지문(기기·IP 해시)으로 등록 제한 확인 → 이미지 저장 → AI 속성 추출·민감 정보 판단 → AI 응답 형식 검증 → 공개본·후보용 블러본 저장 → 임베딩 저장 → 열린 신고와 비교해 알림 생성.

**201 응답** (AI 처리를 응답 안에서 끝내는 방식, 10초 목표)
```json
{
  "id": "6a1f...",
  "status": "REGISTERED",
  "category": "EARPHONE",
  "building": { "id": 1, "name": "혜인관" },
  "floor": 2,
  "storageType": "HANDED_OVER",
  "storagePlace": { "id": 3, "name": "혜인관 경비실", "guideText": "혜인관 1층 정문 옆 경비실" },
  "message": null,
  "handOverAdvice": null
}
```
- 응답에는 공개 정보만 담는다. 색·특징·`categoryAlt`는 습득자에게도 돌려주지 않는다.
- **AI 실패 시에도 `201`**로 응답한다. `"status": "REVIEW"`, `"category": null`, `"message": "분석이 늦어져서 관리자가 확인한 뒤 등록돼요."`
- 물건이 없는 사진이면 `422 NO_OBJECT_DETECTED`, 저장하지 않는다.
- `HANDED_OVER`인데 `storagePlaceId`가 없거나 비활성 보관처면 `400 VALIDATION_ERROR`.
- `IN_PLACE`인데 `storagePlaceId`를 보내거나 `buildingId`가 없으면 `400 VALIDATION_ERROR`.
- 주운 건물을 모르면(`building: null`) 매칭의 위치 점수는 "모름"(0.5)이고 후보 근거에 `SAME_BUILDING`이 붙지 않는다. 응답·후보·상세의 `building`은 `null`일 수 있다.
- 사진은 JPG·PNG·WEBP·HEIC, 10MB 이하. 아니면 `400` / `413 IMAGE_TOO_LARGE`. 서버는 회전을 적용하고 위치(GPS)를 포함한 EXIF를 모두 지운 뒤 긴 변 1600px로 저장한다. 사진은 세 가지로 저장한다: 원본(관리자만), 공개본(판정 통과 후, 1024px, 개인정보 영역만 블러. 민감한데 영역을 모르면 전체 블러), 후보용 블러본(판정 전 후보 카드, 320px, 항상 강한 블러).
- 같은 기기·IP(지문 해시)로 10분에 5건까지. 넘으면 `429 RATE_LIMITED`. (초안)
- AI 분석은 호출마다 제한 시간(기본 8초)이 있고 실패하면 한 번 재시도한다. AI 실패로 민감 여부를 모르면 공개본은 블러 처리한다.
- 동의 필드: `consentVersion`, `consentExternalAi`(`"true"` 필수), `consentLocation`(`"true"`/`"false"`). 물건에 버전과 위치 동의 여부를 남긴다.
- **고가품은 보관처에만** (QA B11, open-issues #32): AI가 고가품(`VALUABLE_CATEGORIES`, 지갑·카드·휴대폰·이어폰 등)으로 본 물건을 `IN_PLACE`로 보내면 `400 VALUABLE_HAND_OVER_REQUIRED` ("귀중품은 보관처(센터·경비실)에 맡겨 주세요.", `details[0].path = "storageType"`). 한 번에 등록은 AI 분석 뒤에야 종류를 알기 때문에, 분석 직후 **사진을 저장하기 전에** 거절한다(물건 행·사진 파일이 남지 않고 등록 횟수에도 세지 않는다). 같은 사진을 `HANDED_OVER`로 다시 보내면 된다. 이 거절은 요청 형식이 아니라 서버 AI 결과에 따라 갈리므로 `VALIDATION_ERROR`와 따로 둬서 화면이 "보관처 고르기"로 바로 이어지게 한다.
- AI가 실패해 종류를 모르면(`REVIEW`) 막지 않는다. 관리자가 검토할 때 종류를 확인한다.
- `handOverAdvice`: 예전 고가품 안내 필드(P0). 고가품을 그 자리에 두는 등록을 이제 거절하므로 **늘 `null`**이다. 응답 호환을 위해 남겨 둔다.
- AI 응답이 4장의 형식과 다르면(허용 밖 색·종류·특징 키, 특징 5개 이상, 사진 밖 영역, 임베딩 차원 불일치) 실패로 보고 `REVIEW`로 저장한다.

#### 두 단계 등록: `POST /found-items/analyze` → `POST /found-items/:id/confirm`
등록 화면에서 AI가 알아본 물건 이름을 먼저 보여 주고 위치를 고르게 하는 흐름용이다. 위의 한 번에 등록과 같은 규칙(사진 처리, 가리기, AI, 등록 제한)을 쓰고, 나눠서 받을 뿐이다.

**1단계 `POST /found-items/analyze`** · 공개 · `multipart/form-data` · 캡차 필요
- 필드: `image`, `consentVersion`, `consentExternalAi`, `consentLocation` (위치 필드는 받지 않는다)
- 사진을 분석해 **확정 전(`ANALYZING`)**으로 저장한다. 확정 전 물건은 후보·알림에 나오지 않는다.
- 물건이 없는 사진이면 `422 NO_OBJECT_DETECTED`, 저장하지 않는다. 등록 제한(10분에 5건)에 들어간다.

```json
{
  "id": "6a1f...",
  "confirmToken": "q3J...(확정할 때 그대로 보낸다)",
  "category": "EARPHONE",
  "isValuable": true,
  "message": null,
  "confirmBy": "2026-10-28T13:00:00.000Z"
}
```
- `category`: AI가 알아본 종류. AI가 실패하면 `null`이고 `message`에 검토 대기 안내가 온다. 이때도 확정할 수 있고, 확정하면 `REVIEW`가 된다.
- `isValuable`: 귀중품이면 `true`. 이때 확정은 `HANDED_OVER`만 받으므로 등록 화면은 "그 자리에 둠"을 감추고 "보관처에 맡김"을 미리 고른다. (open-issues #32, QA B11)
- `confirmToken`: 서버는 HMAC만 저장한다. 이 값을 가진 기기만 확정할 수 있다.
- `confirmBy`(60분)까지 확정하지 않으면 정기 작업이 사진과 행을 지운다(기한 만료로 남기지 않음, 개인정보 최소 수집). 정리한 개수만 서버 로그에 남긴다.

**2단계 `POST /found-items/:id/confirm`** · 공개 · JSON
- 본문: `confirmToken` + 위 표의 위치 필드(`buildingId`, `storageType`, `storagePlaceId`, `floor`, `locationDetail`). 검증 규칙도 같다.
- `201` 응답은 한 번에 등록과 같다. 분석에 성공했으면 `REGISTERED`(새 후보 알림), 실패했으면 `REVIEW`.
- 습득 시각(`foundAt`)과 보관 기한(30일)은 확정한 때부터 센다.
- 없는 물건·틀린 토큰·확정 시간 지남은 모두 `404 NOT_FOUND`. 이미 확정했으면 `409 ALREADY_CONFIRMED` (버튼을 두 번 눌러도 하나만 확정).
- 분석 결과(초안의 `category`)가 귀중품인데 `storageType: IN_PLACE`면 `400 VALUABLE_HAND_OVER_REQUIRED`. 초안은 `ANALYZING` 그대로 남으므로 같은 `confirmToken`으로 보관처를 골라 다시 확정하면 된다. 종류를 모르면(`category: null`, 확정 시 `REVIEW`) 막지 않는다. (QA B11)

### 인증

#### `POST /auth/email/code` · 공개
```json
// 요청
{ "email": "student@skuniv.ac.kr" }
// 응답 204
```
- 이메일은 앞뒤 공백을 지우고 소문자로 바꿔 처리한다.
- 학교 도메인이 아니면 `400 INVALID_EMAIL_DOMAIN`. 도메인은 소문자로 바꾼 뒤 `@` 뒤 전체가 정확히 같아야 한다.
- **이미 가입된 이메일도 `204`**. 가입 여부를 드러내지 않기 위해 코드 대신 로그인 안내 메일을 보낸다.
- 같은 이메일은 1분에 한 번·하루 10번, 같은 IP는 10분에 10번·하루 50번, 서비스 전체 하루 상한(`MAIL_DAILY_LIMIT`). 넘으면 `429 RATE_LIMITED`.
- 코드는 6자리 숫자, 5분 유효, 한 번만 확인할 수 있다. 새 코드를 받으면 이전 코드는 무효. 5번 틀리면 코드를 버리고 다시 받아야 한다.

#### `POST /auth/email/verify` · 공개
```json
// 요청
{ "email": "student@skuniv.ac.kr", "code": "482913" }
// 응답 200
{ "verificationToken": "eyJ...", "expiresAt": "2026-10-13T14:10:00+09:00" }
```
- `verificationToken`은 10분 만료 JWT. 내용: `{ email, purpose: "signup", verificationId }`

#### `POST /auth/signup` · 공개
- 토큰이 만료됐거나 이미 가입에 쓴 토큰(`email_verification.consumed_at`이 있음)이면 `400 INVALID_CODE`.
- 인증 뒤 그사이 같은 이메일로 가입이 끝났어도(동시에 가입) 같은 `400 INVALID_CODE`, 같은 메시지를 준다. 가입 여부를 드러내는 `409`는 쓰지 않는다.
```json
// 요청
{ "verificationToken": "eyJ...", "password": "********", "consent": { "version": "2026-10-12", "email": true, "externalAi": true, "location": true } }
// 응답 201
{ "accessToken": "...", "expiresAt": "...", "user": { "id": "u_...", "email": "student@skuniv.ac.kr", "role": "USER" } }
```
- 비밀번호는 8~64자. (초안)
- 같은 IP에서 10분에 10번까지. 넘으면 `429 RATE_LIMITED`.

#### `POST /auth/login` · 공개
```json
// 요청
{ "email": "student@skuniv.ac.kr", "password": "********" }
// 응답 200
{ "accessToken": "...", "expiresAt": "...", "user": { "id": "u_...", "email": "student@skuniv.ac.kr", "role": "USER" } }
```
- 분실자(`USER`) 계정만. 틀린 비밀번호와 없는 이메일은 같은 `401 UNAUTHORIZED` 메시지로 응답한다.
- 토큰 유효 기간은 7일(초안, open-issues #14). 로그아웃은 프론트가 토큰을 지운다. 만료되면 다시 로그인한다.

#### `POST /auth/demo` · 공개
호출할 때마다 **새 체험 계정**을 만들어 로그인시킨다. 체험 계정은 시드 습득물만 후보로 보고, 판정·열람·수령해도 시드 상태가 바뀌지 않는다. 24시간 뒤 삭제된다.
- 시드 습득물은 `npm run seed:demo -w backend`로 넣는다(여러 번 돌려도 늘지 않음). 물건별 숨은 특징과 체험 순서는 [체험 시나리오](./docs/demo-scenario.md).
- 같은 IP에서 과도하게 만들면 `429 RATE_LIMITED`. (초안: 10분에 5개)
- 요청: `{ "consent": { "version": "2026-10-12", "externalAi": true, "location": false } }`, 헤더 `X-Captcha-Token`.
```json
{ "accessToken": "...", "expiresAt": "2026-10-14T14:00:00+09:00", "user": { "id": "u_...", "email": "demo-7f3a@demo.local", "role": "DEMO" } }
```

#### `GET /me` · 회원
- 토큰이 없거나 만료·위조됐거나, 계정이 삭제됐으면 `401`. 관리자 토큰이면 `403`.
```json
{ "id": "u_...", "email": "student@skuniv.ac.kr", "role": "USER" }
```

### 분실 신고와 후보

#### `POST /lost-reports` · 회원
```json
// 요청
{
  "category": "EARPHONE",
  "lostFrom": "2026-10-13T13:00:00+09:00",
  "lostTo": "2026-10-13T15:00:00+09:00",
  "buildingId": 1,
  "description": "흰색 에어팟 프로, 케이스에 곰돌이 스티커, 오른쪽 아래 긁힌 자국"
}
// 응답 201
{
  "id": "r_...",
  "status": "OPEN",
  "candidates": [
    {
      "foundItemId": "6a1f...",
      "category": "EARPHONE",
      "subCategory": "WIRELESS_EARBUDS",
      "foundAt": "2026-10-13T14:20:00+09:00",
      "building": { "id": 1, "name": "혜인관" },
      "thumbnailUrl": "https://.../files/found/6a1f.../thumb.jpg?exp=...&sig=... (강한 블러본, 10분 만료)",
      "reasons": ["SAME_CATEGORY", "SAME_BUILDING", "FOUND_SOON_AFTER"],
      "attemptsLeft": 3,
      "locked": false,
      "inPersonOnly": false,
      "isSeed": false
    }
  ]
}
```
- `buildingId`는 선택. 모르면 생략한다.
- 후보에는 **공개 정보만** 담는다. 색, 특징, 2순위 종류, 점수는 넣지 않는다. **층도 넣지 않는다**: 그 자리에 둔 물건의 자리를 확인 전에 좁혀 주지 않기 위해서다. 층과 자세한 위치는 판정 통과 후 상세(`GET /found-items/:id/detail`)에서만 준다.
- 사진은 숨은 특징을 알아볼 수 없을 만큼 강하게 흐린 후보용 사본(`thumbnailUrl`)만 준다. 선명한 공개본은 판정 통과 후에만. (10/12 결정, open-issues #29)
- `reasons`는 공개 정보와 신고자가 적은 값으로만 만든 근거다: `SAME_CATEGORY`(공개 종류가 같음), `RELATED_CATEGORY`(공개 종류가 연관 묶음), `SAME_BUILDING`, `FOUND_SOON_AFTER`(잃어버린 시간대 안 ~ 끝 2시간 뒤 사이에 주움, 칩 "잃어버린 시간 근처에 주웠어요"). 2순위 종류로만 걸린 물건에는 종류 근거를 붙이지 않는다. (open-issues #28)
- 후보는 서버가 점수로 고른 **최대 5개**이고, **`foundAt` 최신순**으로 내려준다. 배열 순서는 점수와 관계없다.
- 체험 계정은 시드 습득물만, 일반 계정은 시드가 아닌 습득물만 후보로 받는다. (초안)
- 설명 추출에 실패하거나 응답 형식(4장)이 틀리면 저장하지 않고 `502 AI_UNAVAILABLE`.
- 설명은 5~500자. `lostFrom` ≤ `lostTo`이고 미래 시각은 안 된다. `lostFrom`은 지금부터 1년 안이어야 한다(0년 같은 값은 AI를 부르기 전에 `400`). (초안)
- 후보 점수 = 0.4×속성(종류·색·브랜드) + 0.3×장소 + 0.2×시간 + 0.1×설명 유사도. 값은 `backend/src/matching/policy.ts`에 모여 있다. (초안, 회의)

#### `GET /lost-reports` · 회원
내 신고 목록.
```json
{ "reports": [ { "id": "r_...", "category": "EARPHONE", "status": "OPEN", "description": "...", "lostFrom": "...", "lostTo": "...", "building": { "id": 1, "name": "혜인관" }, "candidateCount": 2, "createdAt": "...", "pickup": { "foundItemId": "f_...", "storageType": "HANDED_OVER", "status": "QR_ISSUED" } } ] }
```
- `pickup`: 이 신고로 확인을 통과한 물건(가장 최근)의 내 수령 상태. 통과한 물건이 없으면 `null`. `PASSED`(통과, 쓸 수 있는 QR 없음) · `QR_ISSUED`(만료 전 수령 QR 있음) · `COMPLETED`(수령 완료, 신고 RESOLVED). 화면은 보관처 물건이 아직 수령 전이면 카드를 눌러 QR 화면(`item-handover.html?id=…&qr=1`)을 바로 열고, 수령 완료 카드는 누를 수 없게 한다.

#### `GET /lost-reports/:id/candidates` · 회원
`{ "candidates": [...] }`. `POST` 응답의 `candidates`와 같은 형식. 새 습득물이 등록되면 늘어난다. 닫힌 신고는 빈 목록. 남의 신고면 `404`.
- 후보는 요청할 때마다 다시 고른다(상위 3개). 응답에 담긴 물건은 이 신고의 "보여 준 후보"(`candidate_exposure`)로 남는다. `POST`·`PATCH` 응답의 `candidates`, 새 후보 알림(`NEW_CANDIDATE`)도 같다.

#### `PATCH /lost-reports/:id` · 회원
```json
// 요청: 신고 닫기
{ "status": "CLOSED" }
// 요청: 설명 고치기 (다시 추출·임베딩하고 후보를 다시 고른다)
{ "description": "흰색 에어팟 프로, 케이스에 곰돌이 스티커" }
// 응답 200: GET /lost-reports/:id/candidates와 같은 형식에 신고 상태를 더한 것
{ "id": "r_...", "status": "OPEN", "candidates": [ ... ] }
```
- 설명 추출에 실패하면 수정하지 않고 `502 AI_UNAVAILABLE`.
- 공백만 다른 설명은 바뀌지 않은 것으로 본다(다시 분석하지 않음). 닫힌 신고는 고칠 수 없다(`400`).

### 일치 판정

#### `POST /lost-reports/:id/claims` · 회원
- 계정·물건별 잠금과 별개로 같은 IP는 10분에 20번까지. 넘으면 `429 RATE_LIMITED`.
```json
// 요청
{ "foundItemId": "6a1f..." }
```

- 판정할 수 있는 습득물: 이 신고의 지금 후보(상위 3개)이거나, **이 신고의 후보로 보여 준 적 있고 지금도 후보 범위 안**인 물건. 새 습득물 때문에 보던 물건이 상위 3개에서 밀려나도 판정할 수 있다.
  - 후보 범위: 등록됨·열람됨, 보관 기한 안, 분실 시작 이후 습득, 연관 종류 묶음 안, 체험 계정은 시드만·일반 계정은 시드 제외.
  - 그 밖(보여 준 적 없는 물건, 수령·만료로 범위를 벗어난 물건, 다른 신고에서만 보여 준 물건, 없는 물건)은 `403 FORBIDDEN`. 아무 물건이나 id로 찔러 보는 것을 막는다 (QA B5, 위협 모델 T2).
- 판정 기준: 사진 특징의 75% 이상 일치·모순 0개면 통과, 그 밖에 일치가 있으면 경계(객관식), 일치 0개·모순 있으면 실패, 일치·모순 모두 0개면 근거 부족(찍기 객관식은 한 번). 상세는 기능 명세서 F-08.
- 이 습득물에 대한 마지막 시도 이후 신고 설명이 바뀌지 않았으면 **새 시도를 만들지 않고 이전 결과를 그대로** 돌려준다(`"reused": true`). 시도 횟수를 쓰지 않는다.

**통과**
```json
{
  "attemptId": "m_...",
  "result": "PASS",
  "reused": false,
  "matchedFields": ["feature:sticker", "place"],
  "foundItemId": "6a1f..."
}
```
→ 프론트는 `GET /found-items/:id/detail`로 이동한다.

**경계 (확인 질문)**
```json
{
  "attemptId": "m_...",
  "result": "BORDERLINE",
  "reused": false,
  "question": "케이스에 붙은 스티커는 어떤 그림인가요?"
}
```
- 질문은 분실자가 신고에 적지 않은 특징으로 만든다. 이미 답한 경계 시도를 `reused`로 돌려줄 때는 질문 대신 답변 결과(`PASS`/`FAIL`)를 돌려준다.

**실패**
```json
{ "attemptId": "m_...", "result": "FAIL", "reused": false, "attemptsLeft": 2, "inPersonOnly": false }
```
- 실패(기회 사용)는 모순(틀린 특징)이 있을 때만이다.

**근거 부족** (10/31)
```json
{ "attemptId": "m_...", "result": "NEED_MORE", "reused": false, "message": "아직 근거가 부족해요. 주인만 알 만한 특징을 더 적어 주세요.", "attemptsLeft": 3, "inPersonOnly": false }
```
- 맞힌 특징도 모순도 없을 때(맞힌 특징 없는 찍기를 이미 쓴 뒤, 질문을 만들 수 없을 때 등). **시도 횟수를 쓰지 않는다**(`attemptsLeft` 그대로). 프론트는 실패 화면 대신 추가 설명을 받는다.
- 계정·습득물마다 1시간에 3번까지. 넘으면 `429 RATE_LIMITED`(시도 기록 없음). 아무 특징이나 넣어 보며 숨은 특징을 알아내는 것을 막는다.
- 확인 질문은 주인이 잘 아는 특징(스티커·키링·케이스·각인·색 등)부터 내고, 흠집·무늬는 그것밖에 없을 때만 낸다.

- 점수 숫자는 응답에 넣지 않는다. 맞은 항목(`matchedFields`)은 **통과했을 때만** 보여준다. 실패·경계 응답에는 어떤 항목이 맞았는지 넣지 않는다.
- `matchedFields` 값: `feature:<특징 key>`, `color`, `brand`, `place`(같은 건물), `time`(분실 후 24시간 안 습득).
- 이미 통과한 물건은 다른 신고로 시도해도 그 결과를 `reused: true`로 돌려준다.
- 경계인데 질문을 만들 수 없으면 모순이 있을 때 실패, 없으면 근거 부족으로 처리한다.
- 같은 물건의 동시 요청은 계정이 달라도 하나씩 처리한다. 특징 대조 AI가 실패하면 `502 AI_UNAVAILABLE`(시도 기록 없음).
- 계정·습득물별 실패 3회면 `409 MATCH_LOCKED`.
- 물건 하나에 모든 계정의 실패(판정 실패 + 질문 오답)가 10회가 되면 그 물건은 대면 확인만 된다: 10번째 실패 응답은 `attemptsLeft: 0, inPersonOnly: true`, 이후 새 판정은 `409 IN_PERSON_REQUIRED`(AI 호출·시도 기록 없음). 맡은 관리자에게 `CLAIM_LOCKED` 알림을 한 번 보낸다. 이미 통과한 계정은 그대로 통과. 체험용 시드는 물건 단위로 막지 않는다. (#29)
- 후보 목록의 `locked`는 이 계정이 횟수를 다 썼거나 대면 확인만 되는 물건이면 `true`, `inPersonOnly`는 대면 확인만 되는 물건.
- 체험 계정이 시드가 아닌 습득물에 시도하면 `403 FORBIDDEN`.

#### `POST /claims/:attemptId/answer` · 회원
- 같은 IP는 10분에 20번까지. 넘으면 `429 RATE_LIMITED`.
```json
// 요청
{ "answer": "곰돌이" }
// 응답 200 (통과)
{ "result": "PASS", "foundItemId": "6a1f..." }
// 응답 200 (실패)
{ "result": "FAIL", "attemptsLeft": 1, "inPersonOnly": false }
```
- 질문 하나당 답변은 한 번만 받는다. 이미 답한 시도면 `409 ALREADY_ANSWERED`.
- 답하기 전에 물건이 대면 확인으로 넘어갔으면 `409 IN_PERSON_REQUIRED`(답 저장 안 함).
- 답변은 1~50자. 넘으면 `400 VALIDATION_ERROR`.
- 정답 판정: 문장부호·조사를 정리하고 질문에 나온 낱말을 뺀 뒤, 남은 낱말이 모두 저장 값의 낱말과 낱말 단위로 같고 2글자 이상 낱말이 있으면 정답(부분 문자열은 아님). 아니면 LLM이 `MATCH`/`NO_MATCH`로 판정한다(온도 0, 입력은 태그로 감싼 데이터, 지시 무시).

### 습득물 상세와 수령

#### `GET /found-items/:id/detail` · 회원
이 계정이 해당 습득물에 `PASS`를 받은 경우에만 응답한다. 아니면 `403 FORBIDDEN`. **호출할 때마다 `reveal_log`에 기록한다.**

```json
{
  "id": "6a1f...",
  "category": "EARPHONE",
  "color": "WHITE",
  "imageUrl": "https://...signed... (개인정보 영역만 가린 공개본, 10분 만료)",
  "building": { "id": 1, "name": "혜인관" },
  "floor": 3,
  "locationDetail": "3층 엘리베이터 앞 벤치 위",
  "storageType": "HANDED_OVER",
  "storagePlace": { "id": 3, "name": "혜인관 경비실", "guideText": "혜인관 1층 정문 옆 경비실" },
  "status": "REVEALED",
  "pickupNotice": "귀중품은 보관처에서 직원이 한 번 더 확인한 뒤 돌려드려요. 학생증을 가져가 주세요(저장하지 않아요)."
}
```
- `pickupNotice`: 고가품(지갑·카드·노트북·태블릿·이어폰, 분류 확정 후 휴대폰·시계 등 추가)이면 안내, 아니면 `null`. (QA W3)
  - 보관처에 맡김(`HANDED_OVER`): 보관처 대면 수령 안내 (위 예시).
  - 그 자리에 둠(`IN_PLACE`): 직원 확인을 약속하지 않는 안내 — "귀중품이라 되도록 빨리 찾아가 주세요. 그 자리에 없으면 종합서비스센터에 문의해 주세요." (예전에 그 자리에 둔 고가품용)
- 수령·기한 만료로 지운 물건은 수령됨이면 `409 ALREADY_CLAIMED`, 만료면 `404`.
- 체험 계정이 열람해도 시드 습득물의 `status`는 바뀌지 않는다.
- 확인 질문 정답(`BORDERLINE` + 정답)도 통과로 본다. 통과하지 않았으면 `403`, 없는 물건 `404`.
- 응답 필드: `id`, `category`, `color`, `imageUrl`(공개본 서명 URL), `imageUrlExpiresAt`, `building`(모르면 `null`), `floor`, `locationDetail`(습득자가 적은 자세한 위치, 없으면 `null`), `storageType`, `storagePlace`, `status`, `foundAt`, `isSeed`, `pickupNotice`. 브랜드·특징·설명은 주지 않는다.
- 다른 일반 계정이 이미 열람한 물건을 새 계정이 처음 열람하면, 맡은 관리자(보관처 관리자, 없으면 종합서비스센터 관리자)에게 `MULTI_REVEAL` 알림을 만든다. 체험 계정은 세지 않는다.

#### `POST /found-items/:id/pickup-qr` · 회원
`storageType`이 `HANDED_OVER`일 때만. 아니면 `409 INVALID_STORAGE_TYPE`. 이미 수령 완료된 물건이면 `409 ALREADY_CLAIMED`.
```json
{ "method": "CENTER_QR", "pickupId": "p_...", "qrToken": "pk_...", "status": "ISSUED", "expiresAt": "2026-10-14T14:00:00+09:00" }
```
- 프론트가 `qrToken`을 QR 이미지로 그린다. 서버에는 해시만 저장한다.
- 같은 계정이 다시 발급받으면 이전 `ISSUED` QR은 `EXPIRED`가 된다.
- 응답에 `method`가 있다: 일반 계정 `CENTER_QR`(QR 발급), 체험 계정 `DEMO`(바로 완료).
- **체험 계정**은 QR 없이 바로 완료된다. 프론트는 "시연: 보관처에서 수령 처리됨" 화면을 보여준다.
```json
{ "pickupId": "p_...", "method": "DEMO", "status": "COMPLETED", "completedAt": "..." }
```

#### `POST /found-items/:id/self-pickup` · 회원
`storageType`이 `IN_PLACE`일 때만. 상태를 `CLAIMED`로 바꾸고 본인 신고로 기록한다. 이미 수령 완료된 물건이면 `409 ALREADY_CLAIMED`. 체험 계정은 기록만 남기고 시드 상태를 바꾸지 않는다(`method: "DEMO"`).
```json
{ "pickupId": "p_...", "method": "SELF_REPORT", "status": "COMPLETED" }
```

### 알림

#### `GET /notifications` · 회원
```json
{
  "notifications": [
    { "id": "n_...", "type": "NEW_CANDIDATE", "message": "혜인관에서 이어폰이 새로 등록됐어요.", "lostReportId": "r_...", "readAt": null, "createdAt": "..." }
  ],
  "unreadCount": 1
}
```

#### `PATCH /notifications/:id/read` · 회원·관리자
응답 204. 이미 읽었으면 그대로 204. 남의 알림이면 `404`.

#### `PATCH /notifications/read-all` · 회원·관리자
응답 204.

- 알림 목록·읽음 처리는 관리자 계정도 쓸 수 있다(자기 알림만, open-issues #13).
- 목록은 최신순 최대 50개.
- 새 후보 알림(`NEW_CANDIDATE`)은 습득물이 `REGISTERED`가 될 때, 그 물건이 실제로 후보(상위 5개)에 들어가는 열린 신고에만 만든다. 신고·물건 조합당 한 번. 알림 생성이 실패해도 등록은 성공한다.

### 관리자

#### `POST /admin/auth/login` · 공개
`/auth/login`과 같은 형식. `role`이 `ADMIN`인 계정만 성공한다. 응답에 소속 보관처를 함께 준다.
```json
{ "accessToken": "...", "expiresAt": "...", "user": { "id": "u_...", "email": "guard@skuniv.ac.kr", "role": "ADMIN" }, "storagePlace": { "id": 3, "name": "혜인관 경비실" } }
```
- 관리자 계정은 `npm run admin:create -w backend`로 직접 만든다.

#### `POST /admin/pickups/scan` · 관리자
```json
// 요청
{ "qrToken": "pk_..." }
// 응답 200
{
  "pickupId": "p_...",
  "foundItem": { "id": "6a1f...", "category": "EARPHONE", "subCategory": "WIRELESS_EARBUDS", "building": "혜인관", "imageUrl": "...(원본)" },
  "claimant": { "emailMasked": "st****@skuniv.ac.kr" },
  "expiresAt": "..."
}
```
- 만료면 `410 QR_EXPIRED`, 이미 처리됐으면 `409 ALREADY_CLAIMED`.
- 물건의 보관처가 관리자의 소속 보관처(`user.storage_place_id`)와 다르면 `403 FORBIDDEN`.
- 없는 QR은 `404`. 같은 사람이 새 QR을 받아 만료된 이전 QR도 `410 QR_EXPIRED`.

#### `POST /admin/pickups/:id/complete` · 관리자
상태를 `COMPLETED`, 습득물을 `CLAIMED`로 바꾸고 처리 관리자를 기록한다. `purge_after`를 30일 뒤로 설정한다. 완료 직후 사진(원본·공개본·후보용 블러본)과 비공개 정보·임베딩을 지운다(open-issues #33). 삭제가 실패해도 수령은 완료되고 정기 작업이 다시 지운다.
- 한 트랜잭션 안에서 물건 상태까지 확인한다. 다른 사람의 수령이 먼저 완료됐으면 `409 ALREADY_CLAIMED`. 다른 보관처 물건이면 `403 FORBIDDEN`.
- 완료되면 수령한 계정의 신고를 `RESOLVED`로 바꾸고, 같은 물건의 다른 사람 QR은 `EXPIRED`로 바꾼다.
```json
{ "pickupId": "p_...", "status": "COMPLETED", "completedAt": "..." }
```

#### `GET /admin/found-items?status=REVIEW&page=1` · 관리자
습득물 목록. P0에서는 `REVIEW`(검토 대기) 확인용으로 쓴다. 20개씩 습득 시각 최신순, `total`과 상태별 개수(`counts`)를 함께 준다. 항목마다 AI가 만든 관리자용 제목(`title`, 비공개 정보 포함)과 층(`floor`)이 있다. 확인 실패가 쌓여 대면 확인만 되는 물건은 `claimLockedAt`(시각, 아니면 `null`)이 있다(목록·상세 모두, #29).
- 관리 범위(open-issues #18 추천안): 경비실 관리자는 자기 보관처 물건만, 종합서비스센터 관리자와 보관처가 없는 관리자는 전체. 범위 밖 물건의 상세·수정은 `403`.

#### `GET /admin/found-items/:id` · 관리자
공개·비공개 정보와 원본·공개본·후보용 블러본 사진 링크(10분), 시도·열람·수령 기록 전체. 수령·기한 만료로 지운 물건은 사진 링크가 `null`이다. 기록의 이메일은 가린다(`st****@skuniv.ac.kr`).
- 수령 기록마다 처리 관리자(`processedByEmailMasked`, 가림)와 대면 확인 메모(`verificationNote`)가 있다. 대면 확인 수령은 계정이 없어 `emailMasked: null`.

#### `PATCH /admin/found-items/:id` · 관리자
검토 대기 습득물의 속성을 직접 고치고 `REGISTERED`로 바꾼다. 등록된 물건의 속성 수정에도 쓴다(상태는 그대로).
- `status: "REGISTERED"`는 검토 대기 물건에만, 종류·설명이 있어야 한다. 등록하면 새 후보 알림을 보낸다.
- 설명이 바뀌거나 등록하면 임베딩을 다시 만든다. 실패하면 아무것도 바꾸지 않고 `502 AI_UNAVAILABLE`.
- `subCategory`는 세부 종류 키로, `category`(바꾸면 바꾼 값)에 속해야 한다. 속하지 않으면 `400`, `null`이면 지운다. 생략하고 `category`만 바꾸면 새 종류에 속하지 않는 세부 종류는 지운다. 목록·상세에도 `subCategory`가 있다. `categoryAlt`를 생략하고 `category`를 다른 값으로 바꾸면 2순위 종류(`categoryAlt`)는 비운다.
- 형식은 AI 응답과 같다: `color`는 12색 키, `features`는 정해진 키로 최대 4개, `brand` 40자, `title` 60자. 어기면 `400`.
```json
{ "category": "UMBRELLA", "color": "BLACK", "features": [{ "key": "pattern", "value": "체크무늬" }], "title": "검정 체크무늬 우산", "status": "REGISTERED" }
```

#### `POST /admin/found-items/:id/in-person-pickup` · 관리자
모든 계정의 확인 실패가 10회에 닿아 온라인 확인이 막힌 물건(`claimLockedAt` 있음)을, 관리자가 찾으러 온 사람의 신분을 직접 확인하고 수령 완료로 바꾼다 (#29 후속).
```json
{ "verificationNote": "학생증 이름·학번 확인, 스티커 위치 설명 일치" }
```
```json
{ "pickupId": "p_...", "method": "IN_PERSON", "status": "COMPLETED", "completedAt": "..." }
```
- 메모는 앞뒤 공백을 빼고 1~200자. 신분증 번호 전체는 적지 않는다. 어기면 `400`.
- 처리 관리자·시각·메모를 수령 기록으로 남기고(계정 없음), 물건을 `CLAIMED`로 바꾼다. 다른 사람이 받아 둔 QR은 `EXPIRED`. 신고는 누구 것인지 몰라 그대로 둔다.
- 완료 직후 사진·비공개 정보를 지우고, 기록(메모 포함)은 30일 뒤 지운다. 다른 수령과 같다.
- `claimLockedAt`은 지우지 않고 그대로 둔다. 물건이 `CLAIMED`라 더 이상 판정·후보 대상이 아니고, "잠겼다가 대면으로 수령됨"을 관리자 화면과 통계에서 구분하는 기록으로 쓴다.
- 관리 범위 밖이면 `403`, 이미 수령됐으면 `409 ALREADY_CLAIMED`, 잠기지 않았거나 보관 중(`REGISTERED`·`REVEALED`)이 아니면 `409 NOT_IN_PERSON_ITEM`. 같은 물건은 하나씩 처리해 동시에 눌러도 한 번만 완료된다.

#### `GET /admin/stats/hotspots?from=2026-10-01&to=2026-10-31` · 관리자
```json
{
  "isSeedData": true,
  "byBuilding": [ { "building": "학술정보관", "count": 12 } ],
  "byHour": [ { "hour": 13, "count": 7 } ],
  "byCategory": [ { "category": "CHARGER", "count": 9 } ],
  "topInsight": "학술정보관에서 오후 1~3시에 충전기 분실이 가장 많아요."
}
```
- 실제 데이터만 집계한다. 기간 안에 실제 데이터가 없으면 시드 데이터로 집계하고 `isSeedData: true`, 화면에 "시드 집계"를 표시한다.
- 기간은 한국 날짜(양 끝 포함), 생략하면 오늘까지 최근 30일, 최대 1년. 시간대는 한국 시간 0~23시.
- `byBuilding`·`byHour`·`byCategory`는 많은 순(같으면 이름순). 응답에 `from`, `to`, `total`도 있다.
- `topInsight`는 건물·2시간 창(1시간씩 밀어 가며)·종류 조합 중 가장 많은 것. 2건 미만이면 "데이터가 적다"는 안내.
- 개인정보가 없는 집계라 모든 관리자가 캠퍼스 전체를 본다.

---

## 4. AI 응답 형식 (내부, 고정 계약)

모델이 바뀌어도 백엔드는 이 형식만 받는다. 모델 선정 전에는 이 형식의 가짜 응답으로 개발한다.

```json
{
  "hasObject": true,
  "category": "EARPHONE",
  "categoryAlt": "CHARGER",
  "subCategory": "WIRELESS_EARBUDS",
  "color": "WHITE",
  "brand": "Apple",
  "features": [
    { "key": "sticker", "value": "곰돌이 스티커" },
    { "key": "scratch", "value": "오른쪽 아래 긁힘" }
  ],
  "description": "흰색 애플 무선 이어폰 케이스, 곰돌이 스티커와 오른쪽 아래 긁힘이 있다.",
  "isSensitive": false,
  "sensitiveRegions": [],
  "title": "흰색 무선 이어폰, 곰돌이 스티커"
}
```

- `categoryAlt`: 2순위 종류. 확신이 높으면 `null`. 후보 검색에만 쓴다.
- `subCategory`: 세부 종류. 큰 종류 24개는 그대로 두고 일부 종류에만 한 단계 더 붙인다(`packages/shared/src/enums.ts`의 `SUB_CATEGORIES`, 예: `CHARGER` → `MOUSE`, `POWER_BANK`; `BAG` → `BACKPACK`). `category`에 속하지 않는 값이 오면 `null`로 바꾼다(실패로 보지 않는다). 공개 정보라 등록·분석 응답, 후보, 상세에 `subCategory`로 내려가고, 화면 이름은 세부 종류가 있으면 그 이름(`SUB_CATEGORY_LABELS`)을 쓴다. 후보 점수에서 큰 종류가 같아도 신고와 습득물의 세부 종류가 둘 다 있고 다르면 종류 점수를 1 → 0.6으로 깎는다. 분실 신고도 설명에서 같은 방식으로 읽는다.
- `color`: 기본 12색 키 중 하나(`WHITE`, `BLACK`, `GRAY_SILVER`, `RED`, `ORANGE_CORAL`, `YELLOW`, `GREEN`, `BLUE_TEAL`, `PURPLE`, `PINK_MAGENTA`, `BROWN`, `OTHER`) 또는 `null`. LOST112 색 코드 묶음은 `docs/api/LOST112.md`, 이웃 색(헷갈리는 색)은 판정에서 모순이 아니라 확인 불가.
- `features`: 최대 4개. `key`는 `sticker`, `scratch`, `case`, `keyring`, `contents`, `text`, `pattern`, `other` 중 하나, `value`는 40자 이하.
- `sensitiveRegions`: 개인정보가 보이는 영역(사진 크기 대비 0~1 비율, `x`·`y`·`width`·`height`). 이 영역만 가린 공개본을 만든다.
- `title`: 관리자 목록용 제목. 비공개 정보가 들어가므로 관리자 화면에만 쓴다.
- 모델: 속성 추출은 `gemini-3.6-flash`, 실패하면 `gemini-3.5-flash`로 한 번 더. 온도 0, JSON 스키마 강제. 사진 속 글자·신고 설명은 데이터로만 다루고 그 안의 지시는 따르지 않는다(신고 설명은 `<report>` 태그로 감싼다).
- 임베딩: `gemini-embedding-001`, 출력 차원 1536(pgvector 인덱스 한도 2000 아래), 길이 1로 정규화.
- 코드 기준: `packages/shared/src/ai.ts`

분실 신고 설명도 같은 형식으로 추출한다(`hasObject`, `isSensitive`, `categoryAlt`, `sensitiveRegions`, `title` 제외).
