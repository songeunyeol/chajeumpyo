# 잃어버린 사람 화면 연결표 (LostApi)

`frontend/lost/*.html` 실제 화면(29c9e8f)에 `LostApi`(api.js)를 붙인 상태를 적는다. 응답 원문은 `_flow.html`(개발용 점검 화면)에서 볼 수 있다.

## 공통

- 모든 연결 화면: `<script src="api.js"></script>` 뒤에 화면 스크립트. 전역 `LostApi`.
- API 주소: 포트 없는 주소(배포)는 같은 출처 `/api/v1`. 포트가 붙은 개발 주소(5500, 8000 등)는 같은 호스트의 **4000** 포트(백엔드 기본, found/api.js와 같음). 다른 서버는 처음 연 화면에 `?api=http://.../api/v1`을 붙이면 이 탭에서 기억한다.
- 로그인이 필요한 화면은 맨 위에서 `const authed = LostApi.requireLogin();` (토큰이 없거나 만료면 `login.html`로 보내고 false). API 호출은 `authed`일 때만.
- 오류는 `LostApi.ApiError`(`status`, `code`, `message`, `details`). 화면 문구는 `LostApi.friendlyMessage(e)`. `401`이면 토큰이 이미 지워져 있으니 `login.html`로.
- 화면 사이 값은 `LostApi.store` + `LostApi.KEYS`(sessionStorage). 예전 시안 키(`lostReports`, `candChances`, `quizChance`, `foundPhoto` 등)는 더 이상 읽지 않는다. `signupEmail`, `refreshLeft`, `lostReport`(올리는 중 화면 문구)만 남아 있다.
- 서버 값은 `textContent`로만 넣는다 (innerHTML 금지).
- 캡차: `POST /auth/email/code`(signup.html·code.html 다시 보내기)와 `POST /auth/demo`(consent-social.html?demo=1)에 붙는다. 지금은 LostApi 기본값 `"dev-pass"`(백엔드 `CAPTCHA_MODE=off`에서만 통과). **PR #47 머지 후**: 두 화면에 `frontend/found/captcha.js` 위젯을 붙이고 `LostApi.config()` → `cfg.captcha.mode === "turnstile"`이면 `LostApi.setCaptchaProvider(() => 위젯 토큰)`. 실패는 `400 CAPTCHA_FAILED` → 위젯 reset.
- `building`은 어디서나 `null`일 수 있다. 후보에는 층이 없다(상세에서만).

## 화면별

| 화면 | 상태 | LostApi 호출 | 보여 주는 값 | 처리하는 오류 |
| --- | --- | --- | --- | --- |
| login.html | 연결 | `login(email, pw)` → home | — | `401`(이메일·비밀번호 틀림 → 회원가입 버튼 노출), `429` |
| login.html "체험해 보기" | **추가** | 링크 → `consent-social.html?demo=1` | — | — |
| signup.html | 연결 | `requestCode(email)` → code. 비밀번호는 `KEYS.signupPassword`에 잠깐 | — | `INVALID_EMAIL_DOMAIN`, `CAPTCHA_FAILED`, `429`(1분 1번) |
| code.html | 연결 | `verifyCode(email, code)` → consent-mail, 다시 보내기 `requestCode` | `maskEmail`, 5분 타이머, 5번 | `INVALID_CODE`(흔들림, 칸 비움), `429` |
| consent-mail.html | 연결 | `signup({ password, location: true })` → home | 세 항목(시안 문구) | `INVALID_CODE`(인증 10분 지남 → signup), `VALIDATION_ERROR` |
| consent-social.html | 체험 동의로 씀 | `?demo=1`: `demoLogin({ location: true })` → home. 그 밖(간편 로그인): "준비 중" 안내 | demo면 전화번호 항목 숨김 | `CAPTCHA_FAILED`, `429`(10분 5개) |
| home.html | 연결 | `reports()`, `notifications()`(알림 점) | 진행 중(OPEN): 종류·`formatRange`·건물·후보 N개 / 닫힘(RESOLVED·CLOSED). 체험 띠 `isDemo()`. 설정: 계정 종류·가린 이메일 | `401` |
| report.html | 연결 | 입력을 `KEYS.reportDraft`에 저장 → uploading | 종류 선택칸(**추가**, 물건 이름으로 `guessCategory`), 날짜는 한국 날짜, 건물은 `buildings()` + "잘 모르겠음" | 설명 5자 미만(화면 검사) |
| uploading.html | 연결 | `createReport(draft)` (애니메이션과 동시에) → home | 후보 수 | `502 AI_UNAVAILABLE`, `VALIDATION_ERROR` → 문구 후 report로 |
| candidates.html | 연결 | `candidates(reportId)`, 확인 `claim()` → `claimScreen` → pass면 `detail()`의 `storageType`으로 item / item-handover, question, fail, lock, counter | 흐린 사진(`thumbnailUrl`을 기존 모자이크 캔버스에), `itemLabel`, 습득일·건물, 근거 칩, 남은 기회, 잠김·대면 확인만 | `403 FORBIDDEN`·`409 ALREADY_CLAIMED` → 목록 다시 받기, `MATCH_LOCKED`→lock, `IN_PERSON_REQUIRED`→counter |
| question.html | 연결(스크립트 교체) | `answer(attemptId, 답)` → pass면 상세, 아니면 fail·lock·counter | 서버 질문 1개, 남은 기회. 답 입력칸·버튼 **추가** | `ALREADY_ANSWERED` → 후보로, `502` |
| fail.html | 연결 | 없음 | `KEYS.claim.attemptsLeft`. "다시 확인" → 후보 | — |
| lock.html · counter.html | 그대로 | 없음 | 고정 문구 | — |
| item.html | 연결 | `detail()` (보관처 물건이면 item-handover로), "확인했어요" `selfPickup()` → home | 사진(10분 서명 URL), 종류, 건물·층·자세한 위치, 습득 시각, 남은 시간, 건물 지도(`naver-map.js`, 건물을 모르면 지도 숨김) | `403`, `409 ALREADY_CLAIMED`(→ "홈으로"), `INVALID_STORAGE_TYPE` |
| item-handover.html | 연결 | `detail()` (그 자리 물건이면 item으로), "수령 QR 받기" `pickupQr()` → 화면 안에 QR(**추가**, qr.html이 없어짐) | 맡긴 곳 이름·안내, `pickupNotice`, QR 남은 시간. 체험 계정은 바로 완료 | `409 ALREADY_CLAIMED`, `INVALID_STORAGE_TYPE` |
| alerts.html | 연결 | `notifications()`, 누르면 `readNotification(id)` → 그 신고의 후보 | 종류별 제목, 서버 문구, 시각, 새 알림 칩 | `401` |
| me.html | 연결 | `me()`, 로그아웃 `logout()` | 계정 종류, 가린 이메일, 로그인 유지 시각(체험은 24시간 안내) | `401` |
| board.html | 그대로 | — | 시안 목차 (지운 building·pass·qr 링크가 남아 있음) | — |

## 서버와 시안이 다른 점 (연결하며 바꾼 것)

- **확인 질문**: 시안은 보기 3개짜리 질문 3개를 화면에서 채점했다(정답이 화면 코드에 있음). 서버는 판정이 BORDERLINE일 때 질문 1개를 주고 자유 입력 답을 받아 서버가 채점한다. 그래서 question.html 스크립트를 바꾸고 입력칸을 넣었다.
- **사진 신고**: 잃어버린 사람 쪽 사진 신고는 화면에도 서버에도 없다. uploading.html은 설명 신고(`POST /lost-reports`)를 올리는 화면으로 연결했다.
- **종류**: 서버는 종류(category)가 꼭 필요하다. 시안은 물건 이름만 받아서 종류 선택칸을 하나 넣었다. 서버로 가는 설명은 "물건 이름. 기억나는 점".
- **후보 새로고침 5번**: 화면 쪽 약속이다. 서버는 횟수를 세지 않고 부를 때마다 후보를 다시 고른다(지금 최대 3개).
- **닫힌 신고 10분 열람**: 서버에 없는 개념이다. 수령하면 상세가 닫힌다(`409 ALREADY_CLAIMED`). 닫힌 카드는 누를 수 없게 했다.
- **실패 후 다시 확인**: 같은 설명으로 다시 판정하면 이전 결과를 돌려준다(`reused`). 설명을 고쳐 다시 판정하려면 `editReport(reportId, 설명)`(PATCH)을 부르는 화면이 필요하다. 지금은 후보로 돌아간다.
- **간편 로그인·이름·전화번호**: 서버에 없다. 화면에서 숨기거나 "준비 중"으로 둔다.

## 점검 화면 `_flow.html`

`frontend/`를 정적 서버로 열고 `/lost/_flow.html`(다른 백엔드면 `?api=...`). 로그인 → 신고(설명 고치기) → 후보 → 확인(질문이면 답) → 상세 → 수령 QR·확인했어요 → 알림 순서로 누르면 응답 원문과 요청 기록(토큰·코드 가림)이 보인다. 개발 서버(`MAIL_MODE=console`)는 인증 코드를 백엔드 로그에 찍는다.
