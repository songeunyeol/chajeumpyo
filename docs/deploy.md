# 배포 (Railway)

백엔드 하나가 API(`/api/v1`)와 정적 화면(`frontend/`)을 같은 주소로 내려준다. 서비스는 두 개만 만든다.

| 서비스 | 내용 |
| --- | --- |
| 앱 | 이 레포의 `Dockerfile`로 빌드. `railway.json`에 헬스체크(`/health`)와 재시작 정책이 들어 있다 |
| DB | PostgreSQL + pgvector. 첫 마이그레이션이 `CREATE EXTENSION vector`를 실행하므로 pgvector가 꼭 있어야 한다 |

컨테이너가 뜰 때마다 `prisma migrate deploy`를 먼저 돌리고 서버를 켠다. 마이그레이션은 추가만 하는 방식이라 배포에서 `migrate reset`·`migrate dev`는 쓰지 않는다.

## 1. CLI 설치와 로그인

```sh
npm i -g @railway/cli
railway login
```

## 2. 프로젝트와 DB 만들기

```sh
railway init            # 새 프로젝트 이름: chajeumpyo
```

DB는 **pgvector가 들어 있는 이미지**로 만든다. Railway 기본 Postgres 템플릿은 버전에 따라 `vector` 확장이 없을 수 있다.

1. 대시보드 → New → Template에서 `pgvector`를 검색해 pgvector 템플릿으로 만든다.
2. 템플릿이 없으면 New → Docker Image로 `pgvector/pgvector:pg17`(로컬 docker-compose와 같은 이미지)을 만들고
   - Volume을 `/var/lib/postgresql/data`에 붙이고
   - `POSTGRES_USER=chajeumpyo`, `POSTGRES_PASSWORD=<긴 무작위 값>`, `POSTGRES_DB=chajeumpyo`, `PGDATA=/var/lib/postgresql/data/pgdata`를 넣는다.
3. 확인: DB 서비스의 Data 탭이나 `railway connect`로 `CREATE EXTENSION IF NOT EXISTS vector;`가 오류 없이 되는지 본다.

## 3. 앱 서비스 만들기

1. New → GitHub Repo → `songeunyeol/chajeumpyo`, 배포 브랜치는 `main`. 레포 루트의 `railway.json`을 읽어 Dockerfile로 빌드한다.
2. **Volume**을 앱 서비스에 붙인다. Mount path: `/data`. 사진이 서버 디스크에 저장되므로 볼륨이 없으면 재배포 때마다 사진이 사라진다.
3. Settings → Networking → Generate Domain으로 `https://<이름>.up.railway.app` 주소를 받는다. 이 주소를 아래 `PUBLIC_BASE_URL`, `CORS_ORIGIN`에 넣는다.
4. 아래 표대로 Variables를 넣고 배포한다.

## 4. 환경 변수

`backend/src/config/env.ts`가 기준이다. 실제 값은 Railway Variables에만 넣고 레포·문서·채팅에 적지 않는다.

| 이름 | 예시 (자리 표시) | 어디서 | 필수 |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | 이미지에 기본으로 들어 있다 | 자동 |
| `PORT` | (넣지 않음) | Railway가 넣어 준다 | 자동 |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | DB 서비스 변수 참조. 직접 만든 이미지면 `postgresql://chajeumpyo:<비밀번호>@<DB서비스>.railway.internal:5432/chajeumpyo` | 필수 |
| `JWT_SECRET` | `<32자 이상 무작위>` | `openssl rand -hex 32` | 필수 |
| `ALLOWED_EMAIL_DOMAINS` | `skuniv.ac.kr` | 가입을 허용할 학교 메일 도메인 (쉼표로 여러 개) | 필수 |
| `PUBLIC_BASE_URL` | `https://<도메인>` | 3번에서 받은 주소. 끝에 `/` 없이. 사진 서명 URL에 쓴다 | 필수 |
| `CORS_ORIGIN` | `https://<도메인>` | 화면과 API가 같은 주소라 같은 값 | 필수 |
| `STORAGE_LOCAL_DIR` | `/data/uploads` | 볼륨 아래 경로 (절대 경로) | 필수 |
| `CAPTCHA_MODE` | `turnstile` | production에서 `off`면 서버가 뜨지 않는다 | 필수 |
| `TURNSTILE_SECRET_KEY` | `<Turnstile 비밀 키>` | Cloudflare 대시보드 → Turnstile → 사이트 추가 (아래 참고) | 필수 |
| `TURNSTILE_SITE_KEY` | `<Turnstile 사이트 키>` | 같은 곳에서 받는 공개 키. `CAPTCHA_MODE=turnstile`이면 없을 때 서버가 뜨지 않고(PR #47), 화면은 `GET /api/v1/config`로 받아 위젯을 띄운다 | 필수 |
| `TURNSTILE_HOSTNAMES` | (보통 넣지 않음) | Turnstile 토큰을 받아 줄 호스트 이름(쉼표 목록). 비우면 `PUBLIC_BASE_URL`의 호스트. 단일 서비스라 보통 같지만, 커스텀 도메인과 `*.up.railway.app`을 함께 열어 두면 둘 다 넣는다(PR #47) | 조건부 |
| `AI_MODE` | `gemini` | 시연용으로 AI 없이 띄우려면 `mock` | 권장 |
| `GEMINI_API_KEY` | `<Gemini 키>` | Google AI Studio. `AI_MODE=gemini`이면 필수 | 조건부 |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` / `GEMINI_EMBED_MODEL` | 기본값 | 바꿀 때만 | 선택 |
| `MAIL_MODE` | `smtp` | `console`이면 인증 메일이 로그에만 찍힌다 | 권장 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `smtp.gmail.com` / `465` / `<계정>` / `<앱 비밀번호>` | 메일 계정. `MAIL_MODE=smtp`이면 필수 | 조건부 |
| `MAIL_FROM` | `찾음표 <no-reply@도메인>` | 보내는 사람 표시 | 선택 |
| `MAIL_DAILY_LIMIT` | `300` | 메일 계정 하루 발송 한도에 맞춘다 | 선택 |
| `DATA_GO_KR_SERVICE_KEY` | `<공공데이터 키>` | 공공데이터포털 (LOST112) | 선택 |
| `TRUST_PROXY` | `1` | 기본 1 (Railway 프록시 한 겹). 아래 참고 | 선택 |
| `API_DOCS_ENABLED` | `false` | `true`면 production에서도 `/api/docs`를 연다 | 선택 |
| `ACCESS_TOKEN_TTL_HOURS`, `DEMO_TTL_HOURS`, `FOUND_ITEM_RETENTION_DAYS`, `AI_TIMEOUT_MS` | 기본값 | 바꿀 때만 | 선택 |
| `FRONTEND_DIR` | (넣지 않음) | 이미지 안 `frontend/`를 그대로 쓴다 | 선택 |

**TRUST_PROXY**: Railway는 앞단 프록시를 한 번 거친다. 이 값이 틀리면 `req.ip`가 프록시 IP가 돼 IP 기준 요청 제한과 등록 지문이 모든 사용자에게 같이 걸린다. 기본 `1`을 그대로 두고, `true`는 넣지 않는다(누구나 IP를 속일 수 있어 express-rate-limit이 경고를 낸다).

## 5. 시드와 관리자 계정

첫 배포가 끝나 마이그레이션이 적용된 뒤 한 번만 돌린다. 이미지 안에서 돌려야 DB 내부 주소에 닿으므로 `railway ssh`를 쓴다.

```sh
railway ssh                      # 앱 서비스 컨테이너 셸 (/app/backend)
npm run db:seed                  # 건물·보관처 (prisma/seed-data). 다시 돌려도 upsert라 안전
npm run seed:demo                # 심사위원 체험용 습득물 (PR #47). 사진이 볼륨(STORAGE_LOCAL_DIR)에 저장되므로 꼭 ssh 안에서 돌린다
npm run admin:create -- --email <관리자 메일> --password '<비밀번호>' --place "<보관처 이름>"   # --place는 선택
exit
```

`AI_MODE`를 나중에 바꾸면(예: `mock` → `gemini`) 시드 습득물의 임베딩이 이전 모드 기준이라 매칭이 맞지 않는다. 바꾼 뒤 `railway ssh`에서 `npm run seed:demo`를 다시 돌린다.

`railway run npm run db:seed -w backend`는 내 PC에서 Railway 변수만 빌려 실행하므로, DB에 공개 주소(TCP Proxy)를 열어 둔 경우에만 된다.

## 6. 확인

```sh
curl https://<도메인>/health                # {"ok":true}
curl https://<도메인>/api/v1/buildings      # 시드한 건물 목록
```

브라우저로 `https://<도메인>/`과 `/found/consent.html`이 열리고, 사진 등록 후 볼륨 `/data/uploads`에 파일이 생기면 된다. `_tester.html`, `.md` 메모, 디자인 확인 화면(`팔레트.html`, `한눈에.html`)은 배포에서 내려주지 않는다(404).

## 참고

- **HTTPS·도메인**: Railway 도메인은 HTTPS가 자동이다. 학교·개인 도메인을 붙이면 Settings → Networking → Custom Domain에 CNAME을 걸고, `PUBLIC_BASE_URL`, `CORS_ORIGIN`을 새 주소로 바꾼 뒤 재배포한다. 위치 권한·카메라는 HTTPS에서만 동작한다.
- **Turnstile**: Cloudflare 대시보드 → Turnstile → Add site에서 도메인(`<이름>.up.railway.app`, 커스텀 도메인)을 넣고 사이트 키와 비밀 키를 받는다. 비밀 키는 `TURNSTILE_SECRET_KEY`에, 사이트 키는 `TURNSTILE_SITE_KEY`에 넣는다. 사이트 키는 서버가 `GET /api/v1/config`로 화면에 내려주고, 화면은 그 값으로 위젯을 띄운다(화면 코드에 키를 적지 않는다). 도메인을 바꾸면 Turnstile 사이트 설정에도 추가해야 한다.
- **메일 발송(위험 요소)**: Railway 요금제에 따라 바깥으로 나가는 SMTP(465·587)가 막혀 있을 수 있다. 배포 직후 학교 메일 주소로 인증 코드를 실제로 한 번 보내 받는지 확인한다. 막혀 있으면 HTTP로 보내는 메일 API(Resend·SendGrid 등)로 바꿔야 한다(지금은 구현하지 않았다). 그 전까지는 시연에 `MAIL_MODE=console`(로그로 코드 확인)을 임시로 쓸 수 있다.
- **Gemini 요금**: 무료 등급은 분당·일일 한도가 낮고 입력이 학습에 쓰일 수 있다. 시연 전 Google AI Studio에서 결제(Billing)를 켜고 예산 알림을 걸어 둔다. 한도를 넘거나 키가 막히면 등록이 검토 대기로 빠진다.
- **사진 저장**: 지금은 `STORAGE_DRIVER=local`만 있어 앱 인스턴스는 하나로 둔다(볼륨은 한 인스턴스에만 붙는다). 사진 URL은 `PUBLIC_BASE_URL/files/...` 서명 링크로만 열린다.
- **로컬에서 이미지 확인**: `docker build --platform linux/amd64 -t chajeumpyo:local .` 후 위 변수를 `-e`로 넣고 `-p 8080:8080 -v <폴더>:/data`로 띄운다.
