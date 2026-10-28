# 잃어버린 사람 화면 연결표 (LostApi)

진짜 화면이 들어오면 이 표대로 `LostApi` 함수를 붙인다. 응답 원문은 `_flow.html`(개발용 점검 화면)에서 바로 볼 수 있다.

## 공통

- 모든 화면: `<script src="api.js"></script>` 한 줄. 전역 `LostApi`가 생긴다.
- API 주소: 배포는 같은 출처 `/api/v1`. 정적 개발 서버(5500 포트)로 열면 같은 호스트의 4100 포트. 다른 서버는 `?api=http://.../api/v1`을 한 번 붙이면 이 탭에서 기억한다.
- 로그인이 필요한 화면은 맨 위에서 `if (!LostApi.requireLogin()) return;` (토큰이 없거나 만료면 `login.html`로 보낸다).
- 오류는 모두 `LostApi.ApiError`(`status`, `code`, `message`, `details`)로 던진다. 화면 문구는 `LostApi.friendlyMessage(e)`.
  - `401 UNAUTHORIZED`면 토큰은 이미 지워져 있다. 문구를 띄우고 `login.html`로.
  - `0 NETWORK`(연결 실패), `429 RATE_LIMITED`(서버 문구를 그대로 씀), `500 INTERNAL_ERROR`는 어느 화면에서나 날 수 있다.
  - `VALIDATION_ERROR`는 `e.details[0].message`(서버가 준 한국어)가 문구가 된다. 칸 옆에 띄우려면 `e.details[].path`를 본다.
- 화면 사이에 넘기는 값은 `LostApi.store`(sessionStorage)와 `LostApi.KEYS`에 이름을 모아 두었다. 대부분 함수가 알아서 저장하고, 인자를 빼면 저장된 값을 쓴다 (`candidates()`, `detail()`, `pickupQr()` 등).
- 표시 도우미: `itemLabel(category, subCategory)`, `colorLabel`, `floorLabel(-1) → "지하 1층"`, `buildingName(b)`(null이면 "건물 모름"), `formatKst(iso)` → `10월 23일(금) 14:10`, `formatRange(from, to)`, `remaining(iso)` → `23시간 58분 남음`, `maskEmail`.
- 캡차: 기본은 개발용 `"dev-pass"`. Turnstile을 붙일 때 `const cfg = await LostApi.config()` → `cfg.captcha.mode === "turnstile"`이면 위젯을 그리고 `LostApi.setCaptchaProvider(() => turnstile.getResponse(id))`. 캡차가 붙는 요청은 `requestCode`, `demoLogin` 두 개다. 실패하면 `400 CAPTCHA_FAILED` → 위젯을 `reset`.
- `building`은 어디서나 `null`일 수 있다 (보관처에 맡겼고 주운 곳을 모름). 후보에는 `floor`가 없다. 층·자세한 위치는 상세에서만.

## 화면별

### login.html — 로그인
- 호출: `LostApi.login(email, password)` → 성공하면 `home.html`.
- "체험해 보기": 동의를 받아야 하므로 `consent-social.html`이 아니라 체험 동의를 거쳐 `LostApi.demoLogin({ location })` → `home.html`. (동의 화면을 따로 두지 않으면 이 화면에 `CONSENT_TEXTS.externalAi`를 보여 주고 바로 호출)
- 오류: `401 UNAUTHORIZED`(이메일·비밀번호 틀림. 같은 문구), `429 RATE_LIMITED`(10분에 20번), 체험은 `400 CAPTCHA_FAILED`, `429`(10분에 5개).
- Google·카카오·네이버 버튼: 백엔드에 간편 로그인이 없다. 버튼은 숨기거나 "준비 중"으로.

### signup.html — 회원가입 (이메일·비밀번호)
- 호출: `LostApi.requestCode(email)` (204, 본문 없음) → `code.html`. 비밀번호는 동의 화면에서 가입할 때 쓰므로 `LostApi.store.set(LostApi.KEYS.signupPassword, pw)`로 잠깐 둔다 (가입하면 지워진다).
- 화면 검사: 비밀번호 8~64자, `@skuniv.ac.kr`.
- 오류: `400 INVALID_EMAIL_DOMAIN`, `400 VALIDATION_ERROR`, `400 CAPTCHA_FAILED`, `429 RATE_LIMITED`(같은 이메일 1분에 1번·하루 10번, IP 10분 10번).
- 이미 가입된 이메일도 204다(가입 여부를 숨김). 메일로 로그인 안내가 간다.

### code.html — 인증 코드
- 보여 줄 값: `LostApi.maskEmail(LostApi.store.get(LostApi.KEYS.signupEmail))`, 5분 타이머.
- 호출: `LostApi.verifyCode(email, code)` → 토큰이 저장되고 `consent-mail.html`. "다시 보내기"는 `requestCode(email)`.
- 오류: `400 INVALID_CODE`(틀림·만료·5번 틀려 버려짐 → 다시 받기), `400 VALIDATION_ERROR`(숫자 6자리 아님), `429`.

### consent-mail.html — 동의 (학교 이메일)
- 보여 줄 값: `LostApi.CONSENT_TEXTS.email / location / externalAi` (문구를 고치려면 `packages/shared/src/api/consent.ts`와 함께, `CONSENT_VERSION`도 올린다).
- 호출: `LostApi.signup({ password: LostApi.store.get(LostApi.KEYS.signupPassword), location: 위치체크 })` → 로그인 상태 → `home.html`. 이메일·외부 AI는 필수(true로 보냄), 위치만 선택.
- 오류: `400 INVALID_CODE`(인증 10분 지남·이미 씀 → `signup.html`부터 다시), `400 VALIDATION_ERROR`(비밀번호, 동의 버전 바뀜 "동의 내용이 바뀌었어요"), `429`.

### consent-social.html — 동의 (간편가입)
- 백엔드에 간편가입이 없다. 체험 로그인 동의로 쓰면: `CONSENT_TEXTS.externalAi`, `location` 두 개만 보여 주고 `LostApi.demoLogin({ location })`. 전화번호 항목은 지운다.

### home.html — 내 분실 신고
- 호출: `LostApi.reports()` → `[{ id, category, status, description, lostFrom, lostTo, building, candidateCount, createdAt }]`, 알림 점에는 `LostApi.notifications()`의 `unreadCount`.
- 보여 줄 값: `itemLabel(category)`, `formatRange(lostFrom, lostTo)`, `buildingName(building)`, `REPORT_STATUS_LABELS[status]`(진행 중·찾음·닫힘), 진행 중이면 "후보 N개".
- 체험 띠: `LostApi.isDemo()`.
- 카드 누르면 `LostApi.store.set(LostApi.KEYS.reportId, id)` → `candidates.html`.
- 오류: `401`.

### report.html — 분실 신고
- 입력: 종류(`LostApi.CATEGORIES`, 이름은 `CATEGORY_LABELS`), 날짜·시작·끝 시각, 건물(`building.html`에서 고름, 모르면 비움), 설명(`DESCRIPTION_MIN`~`DESCRIPTION_MAX`자).
- 건물 화면을 오갈 때 입력은 `LostApi.store.set(LostApi.KEYS.reportDraft, {...})`로 보관.
- 호출: `const range = LostApi.lostRange(date, from, to)` → `LostApi.createReport({ category, ...range, buildingId, description })` → `{ id, status, candidates }`. 신고 id가 저장되고 `candidates.html`.
  - `lostRange`: 한국 시간으로 계산하고, 끝이 지금보다 뒤면 지금으로 줄인다. 끝 시각이 시작보다 빠르면 전날 밤부터로 본다(날짜는 끝 날짜).
- 오류: `400 VALIDATION_ERROR`(설명 길이, "아직 오지 않은 시각이에요", 시작·끝 순서), `502 AI_UNAVAILABLE`(설명을 못 읽음, 저장 안 됨 → 다시 시도), `401`.
- 로딩: AI 추출이 들어가 몇 초 걸린다. 버튼을 막고 기다림 표시.

### building.html — 건물 고르기
- 호출: `LostApi.buildings()` → `[{ id, name, lat, lng }]`. 고르면 `reportDraft.buildingId`에 넣고 `report.html`로.
- "모름"도 고를 수 있게 (buildingId를 비우면 위치 점수는 "모름").

### candidates.html — 후보
- 호출: `LostApi.candidates()` (신고 직후라면 `createReport` 응답의 `candidates`를 그대로 써도 된다).
- 카드마다: 흐린 사진 `LostApi.setImage(img, c.thumbnailUrl)` (null이면 빈 칸), `itemLabel(c.category, c.subCategory)`, `formatKst(c.foundAt, { time: false })` 습득, `buildingName(c.building)`, 근거 칩 `REASON_LABELS[r]`, `isSeed`면 "시연용".
- 상태: `LostApi.candidateState(c)` → `"open"`("확인 기회 3번 중 `attemptsLeft`번 남음" + "내 물건인지 확인") / `"locked"`(잠김 → `lock.html` 안내) / `"inPerson"`(대면 확인만 → `counter.html`).
- 확인 버튼: `LostApi.store.set(LostApi.KEYS.candidate, c)` 후 `LostApi.claim(reportId, c.foundItemId)` → `LostApi.claimScreen(응답)`으로 다음 화면 (`pass`·`question`·`fail`·`lock`·`counter`). 오류도 `claimScreen(e)`에 넣으면 `MATCH_LOCKED → lock`, `IN_PERSON_REQUIRED → counter`.
- 기타 오류: `403 FORBIDDEN`(지금 이 신고의 후보가 아님. 후보는 부를 때마다 서버가 다시 고르므로 새 물건이 들어오면 보던 카드가 빠질 수 있다 → 후보를 다시 불러온다), `409 ALREADY_CLAIMED`, `400 VALIDATION_ERROR`("닫힌 신고예요"), `502 AI_UNAVAILABLE`, `429`.
- 0개면 "아직 비슷한 물건이 없어요. 새로 들어오면 알림으로 알려 줘요."
- 응답의 `reused: true`는 설명이 같아 이전 판정을 그대로 돌려준 것(횟수를 안 씀).

### question.html — 확인 질문 (BORDERLINE)
- 보여 줄 값: `LostApi.store.get(LostApi.KEYS.claim).question`, 남은 횟수는 저장해 둔 후보(`KEYS.candidate`)의 `attemptsLeft`.
- 호출: `LostApi.answer(claim.attemptId, 답)` (1~50자, 자유 입력. 시안의 "있어요/없어요" 버튼만으로는 특징 내용을 말할 수 없으니 입력칸을 둔다) → `claimScreen(응답)`으로 `pass` 또는 `fail`·`lock`·`counter`.
- 오류: `409 ALREADY_ANSWERED`(이미 답함 → 후보로), `400 VALIDATION_ERROR`, `502 AI_UNAVAILABLE`.
- 맞은 항목·점수는 어디에도 보여 주지 않는다.

### pass.html — 확인 통과
- 값: 통과한 물건 id는 이미 `KEYS.foundItemId`에 있다. "사진과 위치 보기" → 상세 화면. 어느 상세로 갈지는 `LostApi.detail()`을 불러 `storageType`으로 정한다 (`IN_PLACE` → `item.html`, `HANDED_OVER` → `item-handover.html`). 또는 한 화면에서 둘 다 처리.

### fail.html — 확인 실패
- 값: `LostApi.store.get(LostApi.KEYS.claim).attemptsLeft` → "N번 남았어요." "다시 확인"은 `candidates.html`(설명을 고치려면 `LostApi.editReport(reportId, 새 설명)` → 후보가 다시 나온다. 설명이 같으면 다시 판정해도 이전 결과를 돌려준다).

### lock.html — 확인 잠금 (이 계정이 3번 다 씀)
- API 호출 없음. 문구는 `ERROR_MESSAGES.MATCH_LOCKED`. "센터 가는 법" → `counter.html`.

### counter.html — 센터에서 확인 (대면 확인만)
- API 호출 없음. 문구는 `ERROR_MESSAGES.IN_PERSON_REQUIRED`. 보관처 이름·안내는 아직 판정 전이라 상세를 못 부른다 → 고정 문구(종합서비스센터)로.

### item.html — 내 물건 (그 자리에 둠)
- 호출: `LostApi.detail()` → `{ id, category, subCategory, color, imageUrl, imageUrlExpiresAt, building, floor, locationDetail, storageType, storagePlace, status, foundAt, isSeed, pickupNotice }`.
- 보여 줄 값: `setImage(img, imageUrl)`(10분 뒤 닫힘: `remaining(imageUrlExpiresAt)`), `itemLabel`, `colorLabel(color)`, 주운 곳 `buildingName(building)` + `floorLabel(floor)` + `locationDetail`, `STORAGE_TYPE_LABELS[storageType]`, `formatKst(foundAt)`, `pickupNotice`가 있으면 안내 상자.
- "확인했어요": `LostApi.selfPickup()` → `{ pickupId, method, status: "COMPLETED", completedAt }` → 완료 표시 후 `home.html`.
- 오류: `403 FORBIDDEN`(통과 안 함), `409 ALREADY_CLAIMED`(이미 가져감), `409 INVALID_STORAGE_TYPE`, `404`.

### item-handover.html — 내 물건 (보관처에 맡김)
- 호출과 값은 `item.html`과 같고, 맡긴 곳은 `storagePlace.name`, `storagePlace.guideText`.
- "수령 QR 받기": `LostApi.pickupQr()` → `qr.html`.
  - 체험 계정은 `{ method: "DEMO", status: "COMPLETED", completedAt }`로 바로 끝난다 → QR 화면 대신 "수령 완료(체험)" 표시.
- 오류: `409 INVALID_STORAGE_TYPE`, `409 ALREADY_CLAIMED`, `403`.

### qr.html — 수령 QR
- 값: `LostApi.store.get(LostApi.KEYS.pickup)` → `{ method: "CENTER_QR", pickupId, qrToken, status: "ISSUED", expiresAt }`. `qrToken`을 QR로 그린다(`_flow.html`처럼 cdnjs `qrcodejs@1.0.0`, SRI 포함). 남은 시간 `remaining(expiresAt)`.
- "QR 다시 받기": `LostApi.pickupQr()` (이전 QR은 바로 못 쓰게 된다).
- `qrToken`은 화면 밖(로그·주소창)에 남기지 않는다. `LostApi`의 요청 기록은 가려서 보낸다.
- 오류: `409 ALREADY_CLAIMED`(센터에서 이미 수령 처리됨 → 완료 표시). `410 QR_EXPIRED`는 관리자 스캔 쪽 오류라 이 화면에서는 `remaining`이 "시간이 지났어요"면 다시 받게 한다.

### alerts.html — 알림
- 호출: `LostApi.notifications()` → `{ notifications: [{ id, type, message, foundItemId, lostReportId, readAt, createdAt }], unreadCount }`.
- 누르면 `LostApi.readNotification(id)` 후, `NEW_CANDIDATE`면 `store.set(KEYS.reportId, lostReportId)` → `candidates.html`. "모두 읽음"은 `readAllNotifications()`.
- `type`: `NEW_CANDIDATE`(새 후보), `MULTI_REVEAL`·`CLAIM_LOCKED`(관리자용), `SYSTEM`.

### me.html — 내 정보
- 호출: `LostApi.me()` → `{ id, email, role }`. 보여 줄 값: `maskEmail(email)`, 체험이면 "체험 계정 (24시간 뒤 삭제)".
- 이름·전화번호는 받지 않으므로 시안에서 뺀다.
- 로그아웃: `LostApi.logout()` → `login.html` (서버 호출 없음).

### board.html
- 시안 모음(목차)이라 연결할 것 없음.

## 점검 화면 `_flow.html`

`frontend/`를 정적 서버로 열고 `/lost/_flow.html`(다른 백엔드면 `?api=...`). 로그인(체험·회원·인증 코드) → 신고(설명 고치기) → 후보(흐린 사진) → 확인(질문이면 답) → 상세 → 수령 QR·확인했어요 → 알림 순서로 누르면 각 단계의 응답 원문과 요청 기록(토큰·코드 가림)이 보인다. 개발 서버(`MAIL_MODE=console`)는 인증 코드를 백엔드 로그에 찍는다.
