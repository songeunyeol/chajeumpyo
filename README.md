# 찾음표 (chajeumpyo)

> 사진 한 장으로 잃어버린 물건을 찾아주는 캠퍼스 분실물 웹앱 — AI가 사진에서 물건의 속성을 추출하고, 분실 신고와 습득물을 자동으로 매칭합니다.

소웨X전컴 2026 공모전 출품작 (제출 마감: 2026-11-01)

## 팀 역할

| 역할 | 이름 |
| --- | --- |
| 프론트엔드 | 송은열 |
| 백엔드 | 정윤호 |
| 기획 | 고가빈 |
| 디자인 | 송은채 |

## AI 스택

- **속성 추출**: Gemini 2.5 Flash-Lite (실패/저신뢰 시 Gemini 2.5 Flash로 폴백)
- **매칭**: gemini-embedding-2 (이미지/텍스트 임베딩)
- **매칭 점수**: 자체 점수 공식 = 속성 일치도 + 임베딩 유사도 + 건물(장소) 일치 + 시간 근접도
- **숨김 특징 검증**: 소유자 확인용 숨김 특징은 서버에서만 검증하며 클라이언트로 절대 전송하지 않음

자세한 결정 배경과 비용, 평가 방법은 [docs/ai-stack.md](docs/ai-stack.md) 참고.

## 문서

| 문서 | 내용 |
| --- | --- |
| [01_기능명세서.md](01_기능명세서.md) | 기능과 정책 |
| [02_ERD.md](02_ERD.md) | 데이터 구조와 DB 규칙 |
| [03_API명세서.md](03_API명세서.md) | API (실행 중 `/api/docs`에서 OpenAPI로도 확인) |
| [docs/open-issues.md](docs/open-issues.md) | 명세 검토 이슈와 결정 이력 |
| [docs/tech-stack.md](docs/tech-stack.md) | 기술 스택 |
| [docs/결과보고서.md](docs/결과보고서.md) | 제출용 결과보고서 원본 |

## 폴더 구조

```
.
├── backend/            # Express API 서버 (Prisma, AI 연동, 매칭 로직)
│   ├── prisma/         # 스키마, 마이그레이션, 시드 데이터
│   └── src/            # routes → services → repositories, ai/
├── packages/shared/    # 프론트·백엔드가 같이 쓰는 zod 스키마와 타입 (API 계약)
├── frontend/           # 웹 프론트엔드 (예정)
├── docs/               # 조사·설계 문서, docs/api/openapi.json
└── qa/                 # 테스트 데이터·평가 스크립트
```

## 로컬 실행 (백엔드)

필요한 것: Node.js 22.12 이상, Docker

```bash
npm install                    # 워크스페이스 전체 설치 + Prisma 클라이언트 생성
# 루트에 .env를 만든다 (아래 "환경 변수" 참고)
npm run db:up                  # PostgreSQL + pgvector (Docker)
npm run db:deploy -w backend   # 마이그레이션 적용
npm run db:seed -w backend     # 건물·보관처 (backend/prisma/seed-data)
npm run dev                    # http://localhost:4000, API 문서 /api/docs
```

| 명령 | 설명 |
| --- | --- |
| `npm test` | 백엔드 테스트 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` / `npm run format` | Biome 검사 / 자동 수정 |
| `npm run openapi -w backend` | `docs/api/openapi.json` 다시 만들기 |
| `npm run db:migrate -w backend` | 스키마를 바꾼 뒤 새 마이그레이션 만들기 |
| `npm run admin:create -w backend -- --email <이메일> --password <비밀번호> [--place <보관처>]` | 관리자 계정 만들기 |
| `npm run seed:dev -w backend` | 개발용 더미 데이터(건물·보관처·관리자 center/guard@skuniv.ac.kr `admin1234!`·습득물). API 서버가 켜져 있어야 함, 다른 포트면 `PORT=4100`. 개발 DB 전용 |

`AI_MODE=mock`이면 Gemini 키 없이 고정된 가짜 응답으로 동작한다. `MAIL_MODE=console`이면 인증 메일 대신 서버 로그에 코드가 찍힌다.

테스트는 같은 Docker DB 안의 `chajeumpyo_test` 데이터베이스를 쓴다. `npm run db:up` 후 `npm test`.

## 프론트엔드가 붙을 때

- API 요청·응답 타입은 `@chajeumpyo/shared`에서 바로 import한다. 백엔드와 같은 zod 스키마라 폼 검증에도 그대로 쓸 수 있다.
- 에러는 항상 `{ "error": { "code", "message", "details?" } }` 형식이다. `code` 목록은 `packages/shared/src/errors.ts`.
- 백엔드가 아직 없는 API는 `docs/api/openapi.json`이나 `03_API명세서.md` 예시로 목업을 만든다.

## 환경 변수

루트 `.env`의 값은 팀 내부로 따로 받는다. 변수 목록과 검증 규칙은 `backend/src/config/env.ts`에 있다. 처음 띄울 때 꼭 채울 것: `POSTGRES_PASSWORD`, `DATABASE_URL`(같은 비밀번호), `JWT_SECRET`(32자 이상), `ALLOWED_EMAIL_DOMAINS=skuniv.ac.kr`, `AI_MODE=mock`, `MAIL_MODE=console`.

`.env` 및 서비스 계정 키 파일은 절대 커밋하지 마세요.
