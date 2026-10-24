# 찾음표 디자인 시스템 — 시안 11 "창구 띠"

> 2026-10-25. 계약 문서는 `docs/frontend/screens.md`(화면 ID·기능). 이 폴더는 그 화면들의 모양 명세다.
> 토큰: `frontend/src/styles/tokens.css` · 목업 공용 CSS: `components.css` · 화면 명세: `screens/batch1.html` ~ `batch4.html`(브라우저로 바로 열림).
> 목업 HTML은 토큰·CSS·Lucide 아이콘(SVG)을 모두 안에 넣은 한 파일이다. 숫자(간격·크기·색)는 그대로 옮기면 된다.

## 1. 원칙

1. **흐름 색 = 띠 색.** 첫 화면의 세 띠가 그대로 세 흐름의 색이 된다.
   | 흐름 | 머리 띠 | 본문 바탕 | 강조 |
   |---|---|---|---|
   | 습득자 F-* | 짙은 초록 `--band-finder` + 흰 글자 | `--surface` | `--brand` |
   | 분실자 L-*·C-04·C-05 | 아이보리 `--band-lost` + 아래 1px 선 | `--band-lost`/`--surface` | `--brand` |
   | 체험 C-03 + 체험 중 모든 L-* | 분실자와 같음 + 맨 위 베이지 **체험 모드 띠**(32px) | 같음 | `--brand` |
   | 관리자 A-* | 먹색 초록 `--band-admin` + 흰 글자 | `--surface` | `--brand` |
   코드에서는 `<body data-flow="finder|lost|demo|admin">`만 바꾸고 `--flow-band` 등 별칭을 쓴다.
2. **머리 띠 두 종류.** 흐름 첫 화면은 큰 띠(`bandhero`: 제목 24/32 + 한 줄 설명 + 단계 막대), 나머지는 56px 띠(`bandhead`: 뒤로 44px + 제목 17). 띠는 모서리 없이 화면 끝까지 꽉 찬다(창구 띠의 핵심).
3. **내용은 밝은 바탕 위 흰 카드.** 카드 radius 14, 그림자 대신 1px 테두리 느낌(`--shadow-card`). 띠 외에는 큰 색 면을 쓰지 않는다.
4. **상태 = 아이콘 + 글자 + 색.** 색만 쓰지 않는다. 통과 `circle-check`·초록 / 확인 질문 `circle-help`·주황 / 실패 `circle-x`·빨강 / 잠김 `lock`·빨강 / 검토 대기 `clock`·노랑 / 대면 확인 `user-check`·남색 / 시연용 데이터 `database`·갈색.
5. **잠긴 것과 열린 것.** 판정 전에는 종류·습득 날짜·건물·층·강하게 흐린 썸네일(눈 가림 아이콘 표시)·공개 근거 칩만. 색·브랜드·특징·점수·순위·"가장 비슷함" 같은 순서 표현 금지. 통과 뒤에만 `lock-open` 해제 연출(L-10).
6. **실패는 힌트 없이.** 실패 화면은 "설명과 일치하지 않아요" + 남은 횟수 + 일반 안내만. 확인 질문은 1개, 답은 1번.
7. **한 손·큰 터치.** 360px 기준, 좌우 여백 20, 주 버튼 52 높이 전체 폭, 칩·탭·아이콘 버튼·목록 행 최소 44. 주 행동은 화면 아래 고정(`foot`).
8. **글.** 해요체, 짧게, 이모지 없음. 버튼은 동사로 끝낸다("등록하기", "체험 시작하기").
9. 폰트 Pretendard, 아이콘 Lucide(stroke 2)만.

## 2. 토큰 요약 (`tokens.css`)

- 색: 띠 4(`--band-finder/lost/demo/admin`), 브랜드(`--brand` #1E5B3D, `--brand-soft`), 바탕(`--surface`, `--surface-card`, `--surface-sunken`), 글자(`--text`, `--text-muted`, `--text-subtle`), 선(`--border`, `--border-strong`), 상태 6쌍(`--pass/question/fail/review/inperson/seed` + `-bg`).
- 글자: display 28/36, headline 24/32, title 20/28, body-lg 17/24, body 15/22, small 13/18, caption 12/16. 굵기 400/500/600/700, 큰 제목 자간 -0.02em.
- 모양: radius 6/10/14/20/full. 간격 4 단위, `--gutter` 20, `--touch` 44, 버튼 52, 입력 48, 머리 띠 56, 하단 탭 64.
- PC 폭: `--w-app` 480(습득자·분실자 가운데), `--w-admin` 1200(관리자).
- Tailwind 연결은 `tokens.css` 맨 위 주석을 그대로 `tailwind.config.ts`에 붙인다(shadcn 기본 이름 primary/destructive/muted/border/ring도 묶어 둠).

### 대비 (WCAG, 글자 4.5:1 이상)

| 글자 / 바탕 | 비 |
|---|---|
| 흰 / band-finder #1C4B34 | 9.97 |
| band-finder-sub #C9DCCF / band-finder | 6.94 |
| 흰 / brand #1E5B3D | 8.02 |
| brand / band-lost #F6F2EA | 7.18 |
| text #1C1F1D / band-lost | 14.89 |
| text-muted #565D58 / 흰 · 아이보리 · 베이지 | 6.77 · 6.06 · 5.12 |
| text-subtle #636964 / 흰 · surface · sunken | 5.62 · 5.34 · 4.73 (베이지 위에는 쓰지 않음) |
| band-demo-fg #5A4527 / band-demo #E8DFCF | 6.86 |
| 흰 / band-admin #22302A | 13.78 |
| pass / pass-bg | 5.57 |
| question / question-bg | 5.48 |
| fail / fail-bg · 흰 / fail | 5.66 · 6.57 |
| review / review-bg | 6.27 |
| inperson / inperson-bg | 8.10 |
| seed / seed-bg | 7.58 |
| 흰 / 토스트 #1C1F1D | 16.63 |

## 3. 컴포넌트 (shadcn/ui 이름)

| 컴포넌트 | shadcn/ui | 변형·규칙 | 목업 클래스 |
|---|---|---|---|
| Button | `Button` | `default`(primary, brand) / `secondary`(흰 바탕+brand 글자+테두리) / `destructive`(danger) / `ghost`(44 높이) / disabled(sunken 바탕) / loading(`loader-circle` 회전 + "…하는 중이에요"). 높이 52, sm 44, radius 10, 16px 600 | `.btn-*` |
| 띠 위 버튼 | `Button` variant `onBand` | 초록 띠 위 흰 버튼 | `.btn-onband` |
| Input | `Input` + `Label` + `FormMessage` | 48 높이, 테두리 border-strong, 포커스 brand 테두리 + 3px 링, 오류 fail 테두리 + 아이콘 붙은 문구 | `.input .focus .err` |
| Textarea | `Textarea` | 최소 120, 글자 수 표시(오른쪽 아래) | `.textarea` |
| OTP | `InputOTP` | 6칸 44×52 | `.otp` |
| Select | `Select` / 긴 목록은 `Drawer` 안 라디오 목록 | 오른쪽 `chevron-down` | `.select` |
| 종류 칩 선택 | `ToggleGroup type="single"` | 24종 전부, 아이콘+이름, 44 높이 알약. 선택 시 brand-soft + brand 테두리 + 굵게. 위에 검색 `Input` | `.chip .on` |
| 2지선다 | `RadioGroup`(카드형) | 64 높이 두 칸, 선택 2px brand 테두리 | `.seg` |
| 라디오 목록 | `RadioGroup` | 행 56, 같은 건물 표시 `같은 건물` 작은 배지 | `.opts .opt-row` |
| Checkbox 동의 행 | `Checkbox` | 22px 상자, 행 전체 터치, 오른쪽 `chevron-right`로 전문 | `.check` |
| CandidateCard | `Card` | 흐린 썸네일 72(블러 14px 이상 + `eye-off`), 종류 아이콘+이름, "날짜 습득 · 건물 층", 공개 근거 칩, "확인 기회 3번 중 n번 남음", [내 물건인지 확인]. 변형: 기본 / 잠김(내 3회 소진, `lock` 배지, 버튼 없음) / 대면 확인만(`user-check` 배지, [방문 안내 보기]) / 썸네일 없음(종류 아이콘 상자) / 시드 배지 | `.cand` |
| StatusBadge | `Badge` | 24 높이, 12px 700, 아이콘 14. 습득물 상태: 분석 중·등록됨·열람됨·수령 완료·기한 만료·검토 대기. 판정: 통과·확인 질문·일치하지 않음·잠김·대면 확인만 | `.badge .b-*` |
| 공개 근거 칩 | `Badge variant="outline"` | 26 높이, sunken 바탕, 누를 수 없음 | `.reason` |
| NotificationItem | 목록 행(`button`) | 72 이상, 원 아이콘 36, 안 읽음은 오른쪽 brand 점 + 굵은 글, 읽음은 muted | `.noti` |
| EmptyState | — | 64 원 아이콘 + 제목 20 + 한 줄 + 버튼 | `.empty` |
| Toast | `Sonner` | 먹색 바탕, 아이콘 색만 상태 구분, 아래 탭 위 16px | `.toast` |
| BottomSheet | `Drawer`(vaul) | 위 radius 20, 손잡이 40×4, 바탕 scrim 48%. C-02 동의, 건물 고르기 | `.sheet` |
| Stepper | 자체(`div` 막대) | 4px 막대 n개, 진행분 brand. 초록 띠 위에서는 흰색 | `.stepper` |
| Skeleton | `Skeleton` | sunken → 밝은 색 흐름 1.4s | `.sk` |
| Progress | `Progress` | 6px, 등록 중·판정 중 | `.progress` |
| Alert | `Alert` | info/warn/fail/review/inperson/plain. 아이콘 + 굵은 제목 + 본문 | `.alert .a-*` |
| DemoBanner | 자체 | 32px 베이지 띠, `flask-conical` + "체험 모드 · 시연용 데이터로 움직여요". 체험 계정의 모든 화면 맨 위(머리 띠 위) | `.demostrip` |
| SeedBadge | `Badge` | `database` + "시연용 데이터"(후보·상세) / "시드 집계"(A-06) | `.b-seed` |
| QR card | `Card` + `qrcode.react` | QR 232px(여백 12 포함), 아래 만료 시각·남은 시간 | `.qr-card .qr` |
| LockReveal | 자체 + CSS | L-10 참고 | 배치 2 |
| BottomTab | 자체 `nav` | 3칸(홈·알림·내 정보) 64 높이, 선택 brand + 굵게, 알림 빨간 점 | `.tabbar` |
| Captcha | Turnstile 위젯 | 65 높이 자리, 개발 중엔 통과 토큰 | `.captcha` |

### 종류 아이콘 (Lucide) — 24종

지갑 `wallet` · 학생증·신분증 `id-card` · 운전면허증 `car` · 체크·신용카드 `credit-card` · 교통카드 `bus` · 기타 카드 `ticket` · 휴대폰 `smartphone` · 무선 이어폰 `headphones` · 스마트워치 `watch` · 태블릿 `tablet` · 노트북 `laptop` · 충전기·기타 전자기기 `battery-charging` · 가방 `backpack` · 의류 `shirt` · 모자 `graduation-cap`(Lucide에 일반 모자 없음) · 교재·도서 `book-open` · 안경·선글라스 `glasses` · 시계·액세서리 `gem` · 현금 `banknote` · 우산 `umbrella` · 텀블러·물병 `cup-soda` · 열쇠 `key-round` · 필기구·필통 `pencil` · 기타 `package`

### 레이아웃 규칙

- 모바일 기준 360×740. 화면 = [체험 띠 32] + 머리 띠 56(또는 큰 띠) + 본문(스크롤, 위아래 20 여백, 블록 사이 16) + 아래 고정 버튼 영역(위 12, 아래 20 + safe-area) 또는 하단 탭 64.
- 터치 44 이상: 버튼·칩·탭·아이콘 버튼·목록 행·텍스트 링크(링크도 44 높이 상자). 목업 렌더 때 자동 검사함.
- PC(1280): 습득자·분실자는 가운데 480 폭 열(바깥은 띠 색이 화면 끝까지 이어짐), 관리자는 왼쪽 내비 + 최대 1200 넓은 표. 배치 4.

## 4. 배치별 화면 노트와 수락 기준

검사 방법: `screens/batchN.html`을 헤드리스 Chromium(playwright 1.48.2)으로 열어 프레임마다 PNG로 찍고 눈으로 확인, 같은 스크립트로 터치 영역(44 미만)과 본문 넘침을 자동 검사. 대비는 토큰 값으로 계산(위 표).

### 배치 1 — 토큰·컴포넌트, C-01, C-02, C-03, F-01~F-04 (`screens/batch1.html`)

화면 노트
- **C-01 첫 화면**: 세 띠가 화면 전체. 초록 262(왼쪽 위 "찾음표" 글자 로고, 카메라 아이콘, "물건을 주웠어요 / 가입 없이 사진만") · 아이보리 246("잃어버렸어요 / 로그인 · 회원가입") · 베이지 나머지("심사위원용" 꼬리표, "체험해 보기", 한 줄 소개). 띠 하나가 링크 하나. 맨 아래 "관리자 로그인" 작은 밑줄 링크(44 높이). 오른쪽 원 화살표는 장식.
- **C-02 동의 시트**: "모두 동의해요" + 항목별 체크. 습득자·체험 = [필수] 사진 외부 AI 처리, [선택] 위치 사용. 회원가입 = [필수] 학교 이메일 수집 + 위 둘. 필수 미체크면 버튼 비활성 + 아래 안내. 처음 한 번(동의 버전이 바뀌면 다시). 요청 본문 `consent`에 버전·항목을 담는다.
- **C-03 체험 시작**: 베이지 큰 띠. 3단계 설명, AI 처리 동의 한 줄(보기 → C-02 전문), Turnstile, [체험 시작하기]. 상태: 기본 / 만드는 중(버튼 로딩) / 캡차 실패 · 429(같은 자리 Alert 하나). 성공하면 L-03으로, 그때부터 체험 모드 띠.
- **F-01 사진 찍기**: 초록 큰 띠 + 단계 1/2. 점선 상자, 팁 3줄, [카메라로 찍기](`<input type=file accept="image/*" capture="environment">`), [앨범에서 고르기], 형식·10MB 캡션. 고른 뒤 미리보기 + [다음] / [다시 찍기]. 처음 들어올 때 C-02 시트.
- **F-02 등록 정보**: 건물 추천 카드(사진 썸네일 + 건물 + 출처 문구 + [바꾸기]) → 건물 시트(검색 + 라디오). 층 칩 가로 스크롤(B1~), 선택. 보관 2지선다, 보관처에 맡김이면 보관처 라디오 목록(같은 건물 먼저 + 배지). 캡차, 아래 고정 [등록하기]. "위치는 건물을 고르는 데만 쓰고 서버로 보내지 않아요."
- **F-03 등록 중**: 회전 아이콘, 3단계 목록, 시간 기반 진행 막대(10초에 90%).
- **F-04 등록 결과 6종**: 등록됨(종류 아이콘·종류, 주운 곳, 보관) / 귀중품 그 자리(주황 Alert + handOverAdvice 보관처 목록) / 검토 대기(노랑 시계, 서버 `message` 문구) / 물건 안 보임 422(다시 찍기, 입력 유지) / 429 / 413. 습득자는 AI 결과를 고치지 않는다(수정 버튼 없음).

수락 기준과 결과

| # | 기준 | 결과 |
|---|---|---|
| 1 | C-01이 시안 11과 같은 세 띠 구조·순서·색·문구 | 통과 |
| 2 | 습득자 화면 전부 초록 머리 띠, 체험 화면은 베이지 | 통과 |
| 3 | 글자 대비 4.5:1 이상(토큰 계산, 위 표) | 통과 — text-subtle 처음 값 #6B716C가 아이보리에서 4.47이라 #636964로 고침 |
| 4 | 터치 영역 44 이상(자동 검사) | 통과 — 처음 "보기" 링크 24px 폭 → 링크 최소 44 폭으로 고침 |
| 5 | 상태는 아이콘+글자 (배지·결과 원·Alert) | 통과 |
| 6 | screens.md F-04 변형 전부(등록됨/검토 대기/422/429/413/귀중품 안내) | 통과 |
| 7 | F-02 건물 추천 3단계 출처·좌표 미전송 안내·같은 건물 먼저 | 통과 |
| 8 | 습득자 가입·이름·연락처 입력 없음, 3탭(찍기→다음→등록하기) | 통과 |
| 9 | 본문이 360×740 안에 넘치지 않음(긴 화면은 "스크롤 전체"로 표시) | 통과 |
| 10 | 해요체·이모지 없음·Lucide만 | 통과 — 컴포넌트 시트 2지선다 아이콘 위치 어긋남 고침. 예외: 첫 화면 한 줄 소개 "…위치가 열린다."는 screens.md 문구 그대로(질문 1) |

### 배치 2 — L-01~L-12, C-04, C-05 (`screens/batch2.html`)

다음 단계에서 작업(오케스트레이터 승인 후).

### 배치 3 — A-01~A-06 (`screens/batch3.html`)

다음 단계에서 작업(오케스트레이터 승인 후).

### 배치 4 — C-06, C-07, PC, PWA 아이콘 (`screens/batch4.html`)

다음 단계에서 작업(오케스트레이터 승인 후).

## 5. 팀에 물어볼 것

1. 첫 화면 한 줄 소개가 "사진은 바로 올리고, 특징이 맞아야 위치가 열린다."(한다체)로 시안·screens.md에 고정돼 있다. 다른 문구는 모두 해요체다. 슬로건이라 그대로 두었다. "…위치가 열려요."로 바꿀지 결정 필요.
