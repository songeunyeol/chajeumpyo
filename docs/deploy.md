# 배포 (Render)

운영 주소: https://chajeumpyo.onrender.com (2026-10-29부터)

백엔드 하나가 API(`/api/v1`)와 정적 화면(`frontend/`)을 같은 주소로 내려준다. Render(싱가포르, 유료)에 두 개만 만든다.

| 서비스 | 내용 |
| --- | --- |
| 웹 서비스 | 이 레포의 `Dockerfile`로 빌드. 헬스체크 `/health`, 디스크 `/data`(1GB, 사진 저장) |
| Postgres | Render PostgreSQL. 첫 마이그레이션이 `CREATE EXTENSION vector`를 실행한다(Render Postgres는 pgvector를 지원) |

컨테이너가 뜰 때마다 `prisma migrate deploy`를 먼저 돌리고 서버를 켠다. 마이그레이션은 추가만 하는 방식이라 배포에서 `migrate reset`·`migrate dev`는 쓰지 않는다.

> 처음에는 Railway로 준비했지만(PR #44) 신규 가입이 막혀 Render로 옮겼다.

## 키 다루기

- Render API 키와 서비스 키(Gemini, Turnstile, SMTP)는 **로컬 `.env`에만** 둔다. `.env`는 커밋하지 않는다(`.gitignore`).
- 셸에서 값이 필요하면 키 하나씩 읽고, 화면에는 길이만 찍는다. `.env` 전체를 `source`하지 않는다(따옴표·특수문자로 깨진다).

```sh
K=$(grep '^RENDER_API_KEY=' .env | cut -d= -f2- | tr -d '"'); echo ${#K}
```

## 1. 처음 만들기 (대시보드)

1. **Postgres**: New → PostgreSQL, 리전 Singapore. 만든 뒤 Internal Database URL을 복사해 둔다. 바깥에서 붙는 IP 허용 목록은 비워 둔다(DB 작업은 아래 4번처럼 컨테이너 안에서 한다).
2. **웹 서비스**: New → Web Service → Public Git Repository에 `https://github.com/songeunyeol/chajeumpyo`, 브랜치 `main`, 런타임 Docker, 리전 Singapore.
   - Health Check Path: `/health`
   - Disk: Mount path `/data`, 1GB. 디스크가 없으면 재배포 때마다 사진이 사라진다.
   - Docker Command는 **비워 둔다**(이미지 기본 명령이 마이그레이션 후 서버를 켠다).
3. 아래 3번 표대로 Environment를 넣고 배포한다.

## 2. 배포 (머지할 때마다 직접)

공개 Git URL로 연결해서 **자동 배포가 동작하지 않는다**. main에 머지한 뒤 대시보드의 Manual Deploy → Deploy latest commit을 누르거나 API로 배포한다.

```sh
S=<웹 서비스 id>   # srv-로 시작. 대시보드 주소나 GET /v1/services에서 확인
curl -s -X POST -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{}' \
  https://api.render.com/v1/services/$S/deploys | jq -r .id
# 상태: GET /v1/services/$S/deploys/<deploy id> 의 status가 live가 될 때까지
curl -s -o /dev/null -w "%{http_code}\n" https://chajeumpyo.onrender.com/health   # 바뀌는 동안 잠깐 502가 날 수 있다
```

화면 파일(서비스 워커가 캐시하는 파일)을 바꿨으면 `frontend/sw.js`의 `VERSION`을 올려야 휴대폰에 새 화면이 뜬다. 확인할 때는 앱을 완전히 닫았다가 다시 연다.

## 3. 환경 변수

`backend/src/config/env.ts`가 기준이다. 실제 값은 Render Environment에만 넣고 레포·문서·채팅에 적지 않는다.

| 이름 | 예시 (자리 표시) | 어디서 | 필수 |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | 이미지에 기본으로 들어 있다 | 자동 |
| `PORT` | (넣지 않음) | Render가 넣어 준다 | 자동 |
| `DATABASE_URL` | `postgresql://<사용자>:<비밀번호>@<DB 내부 호스트>/<DB>` | Render Postgres의 **Internal** Database URL | 필수 |
| `JWT_SECRET` | `<32자 이상 무작위>` | `openssl rand -hex 32` | 필수 |
| `ALLOWED_EMAIL_DOMAINS` | `skuniv.ac.kr` | 가입을 허용할 학교 메일 도메인 (쉼표로 여러 개) | 필수 |
| `PUBLIC_BASE_URL` | `https://chajeumpyo.onrender.com` | 서비스 주소. 끝에 `/` 없이. 사진 서명 URL에 쓴다 | 필수 |
| `CORS_ORIGIN` | `https://chajeumpyo.onrender.com` | 화면과 API가 같은 주소라 같은 값 | 필수 |
| `STORAGE_LOCAL_DIR` | `/data/uploads` | 디스크 아래 경로 (절대 경로) | 필수 |
| `CAPTCHA_MODE` | `turnstile` | production에서 `off`면 서버가 뜨지 않는다 | 필수 |
| `TURNSTILE_SECRET_KEY` | `<Turnstile 비밀 키>` | Cloudflare 대시보드 → Turnstile → 사이트 추가 (아래 참고) | 필수 |
| `TURNSTILE_SITE_KEY` | `<Turnstile 사이트 키>` | 같은 곳에서 받는 공개 키. `CAPTCHA_MODE=turnstile`이면 없을 때 서버가 뜨지 않고(PR #47), 화면은 `GET /api/v1/config`로 받아 위젯을 띄운다 | 필수 |
| `TURNSTILE_HOSTNAMES` | (보통 넣지 않음) | Turnstile 토큰을 받아 줄 호스트 이름(쉼표 목록). 비우면 `PUBLIC_BASE_URL`의 호스트. 단일 서비스라 보통 같지만, 커스텀 도메인과 `*.onrender.com`을 함께 열어 두면 둘 다 넣는다(PR #47) | 조건부 |
| `AI_MODE` | `gemini` | 시연용으로 AI 없이 띄우려면 `mock` | 권장 |
| `GEMINI_API_KEY` | `<Gemini 키>` | Google AI Studio. `AI_MODE=gemini`이면 필수 | 조건부 |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` / `GEMINI_EMBED_MODEL` | 기본값 | 바꿀 때만 | 선택 |
| `GEMINI_THINKING_LEVEL` | 기본값(`MINIMAL`) | 사진·신고 분석의 생각 정도. `DEFAULT`면 모델 기본값(느림). `docs/ai-stack.md` 측정 참고 | 선택 |
| `MAIL_MODE` | `smtp` | `console`이면 인증 메일이 로그에만 찍힌다 | 권장 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `smtp.gmail.com` / `465` / `<계정>` / `<앱 비밀번호>` | 메일 계정. `MAIL_MODE=smtp`이면 필수 | 조건부 |
| `MAIL_FROM` | `찾음표 <no-reply@도메인>` | 보내는 사람 표시 | 선택 |
| `MAIL_DAILY_LIMIT` | `300` | 메일 계정 하루 발송 한도에 맞춘다 | 선택 |
| `DATA_GO_KR_SERVICE_KEY` | `<공공데이터 키>` | 공공데이터포털 (LOST112) | 선택 |
| `TRUST_PROXY` | `1` | 기본 1 (앞단 프록시 한 겹). 아래 참고 | 선택 |
| `API_DOCS_ENABLED` | `false` | `true`면 production에서도 `/api/docs`를 연다 | 선택 |
| `ACCESS_TOKEN_TTL_HOURS`, `DEMO_TTL_HOURS`, `FOUND_ITEM_RETENTION_DAYS`, `AI_TIMEOUT_MS` | 기본값 | 바꿀 때만 | 선택 |
| `FRONTEND_DIR` | (넣지 않음) | 이미지 안 `frontend/`를 그대로 쓴다 | 선택 |

**TRUST_PROXY**: Render는 앞단 프록시를 한 번 거친다. 이 값이 틀리면 `req.ip`가 프록시 IP가 돼 IP 기준 요청 제한과 등록 지문이 모든 사용자에게 같이 걸린다. 기본 `1`을 그대로 두고, `true`는 넣지 않는다(누구나 IP를 속일 수 있어 express-rate-limit이 경고를 낸다).

## 4. 시드와 관리자 계정 (컨테이너 안에서 한 번 돌리기)

시드 사진이 웹 서비스 디스크(`/data`)에 저장되므로 그 컨테이너 안에서 돌려야 한다. Render의 one-off job은 디스크를 붙이지 못하고, DB는 바깥 접속을 막아 두었다. 그래서 **Docker Command를 잠깐 바꿔 한 번 배포한 뒤 되돌린다**.

Render는 Docker Command를 공백으로 쪼개고 따옴표를 처리하지 않는다(따옴표를 넣으면 status 127로 실패). 안쪽 명령을 base64로 감싸 공백 없이 넣는다.

```sh
# 안쪽 명령 (작업 디렉터리는 /app/backend). 마지막에 서버를 켜야 서비스가 계속 뜬다
# 이미지 안의 CLI를 직접 부른다 (npx가 다른 버전을 내려받지 않게)
INNER='../node_modules/.bin/prisma migrate deploy && ../node_modules/.bin/tsx prisma/seed.ts && ../node_modules/.bin/tsx scripts/seed-demo.ts ; exec node dist/server.js'
B=$(printf '%s' "$INNER" | base64 | tr -d '\n')
CMD='sh -c echo${IFS}'"$B"'|base64${IFS}-d|sh'
jq -n --arg c "$CMD" '{serviceDetails:{envSpecificDetails:{dockerCommand:$c}}}' | \
  curl -s -X PATCH -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d @- https://api.render.com/v1/services/$S
# → 2번처럼 배포하고 live가 되면 로그(GET /v1/logs?ownerId=...&resource=$S)로 결과를 본다
# 끝나면 반드시 되돌리고 한 번 더 배포한다
jq -n '{serviceDetails:{envSpecificDetails:{dockerCommand:""}}}' | \
  curl -s -X PATCH -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d @- https://api.render.com/v1/services/$S
```

- `prisma/seed.ts`: 건물·보관처(`prisma/seed-data`). 다시 돌려도 upsert라 안전하다. 보관처는 교무처(혜인관 1층, 평일 9~18시) 한 곳이다.
- `seed-demo.ts`: 심사위원 체험용 시드 습득물 14개(`docs/demo-scenario.md`). 다시 돌리면 같은 id로 고친다.
- `AI_MODE`를 바꾸면(예: `mock` → `gemini`) 시드 임베딩이 이전 모드 기준이라 매칭이 맞지 않는다. 바꾼 뒤 시드를 다시 돌린다.

**관리자 계정**: 비밀번호가 Docker Command(설정 화면·로그)에 남지 않도록 환경 변수로 잠깐 넘긴다.

1. 비밀번호를 만들어 로컬 `.env`에 저장한다(예: `DEMO_ADMIN_PASSWORD`).
2. `PUT /v1/services/$S/env-vars/NEW_ADMIN_PASSWORD`로 그 값을 넣는다(키 하나만 바꾸는 API. `PUT /env-vars` 전체 교체는 쓰지 않는다).
3. 안쪽 명령을 `../node_modules/.bin/tsx scripts/create-admin.ts --email <관리자 메일> --password "$NEW_ADMIN_PASSWORD" --place 교무처 ; exec node dist/server.js`로 해서 위처럼 배포한다.
4. `POST /api/v1/admin/auth/login`으로 로그인되는지 확인한다.
5. Docker Command를 `""`로 되돌리고, `DELETE /v1/services/$S/env-vars/NEW_ADMIN_PASSWORD`로 지운 뒤 한 번 더 배포한다.

## 5. 확인

```sh
curl https://chajeumpyo.onrender.com/health                # {"ok":true}
curl https://chajeumpyo.onrender.com/api/v1/buildings      # 시드한 건물 목록
```

브라우저로 `/`, `/found/consent.html`, `/lost/home.html`, `/admin/login.html`이 열리면 된다. `_`로 시작하는 개발용 파일과 `.md` 메모는 배포에서 내려주지 않는다(404).

## 참고

- **HTTPS·도메인**: `*.onrender.com`은 HTTPS가 자동이다. 커스텀 도메인을 붙이면 `PUBLIC_BASE_URL`, `CORS_ORIGIN`, Turnstile 사이트 설정, 네이버 지도 서비스 URL을 모두 새 주소로 바꾼다. 위치 권한·카메라는 HTTPS에서만 동작한다.
- **Turnstile**: Cloudflare 대시보드 → Turnstile에서 호스트 이름 `chajeumpyo.onrender.com`(개발용 `localhost` 포함)으로 사이트를 만들고, 비밀 키는 `TURNSTILE_SECRET_KEY`, 사이트 키는 `TURNSTILE_SITE_KEY`에 넣는다. 사이트 키는 서버가 `GET /api/v1/config`로 화면에 내려준다(화면 코드에 키를 적지 않는다). 캡차는 습득물 사진 분석, 인증 코드 발송, 체험 로그인에 걸려 있다.
- **네이버 지도**: 네이버 클라우드 플랫폼 Maps 앱의 Web 서비스 URL에 `https://chajeumpyo.onrender.com`을 등록해야 위성 지도가 뜬다. 인증이 막히면 화면이 Esri 위성 사진 위에 건물 핀만 올린다(`frontend/naver-map.js`).
- **메일 발송**: Gmail SMTP(465, 앱 비밀번호)로 보낸다. Render에서 발송되는 것을 10/29 확인했다. 학교 메일(Google Workspace)에서는 스팸함으로 갈 수 있어 인증 코드 화면에 안내를 넣었다. 급하면 `MAIL_MODE=console`(로그로 코드 확인)을 임시로 쓸 수 있다.
- **Gemini 요금**: 운영은 유료 등급(결제 완료)이다. Google AI Studio에서 예산 알림을 걸어 둔다. 한도를 넘거나 키가 막히면 등록이 검토 대기로 빠진다.
- **사진 저장**: 지금은 `STORAGE_DRIVER=local`만 있어 인스턴스는 하나로 둔다(디스크는 한 인스턴스에만 붙는다). 사진 URL은 `PUBLIC_BASE_URL/files/...` 서명 링크로만 열린다.
- **로컬에서 이미지 확인**: `docker build --platform linux/amd64 -t chajeumpyo:local .` 후 위 변수를 `-e`로 넣고 `-p 8080:8080 -v <폴더>:/data`로 띄운다.
