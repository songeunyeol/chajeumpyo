# 기술 스택

> 상태: 초안 (2026-10-11). 회의에서 확정한다.
> 기준 문서: [기능 명세서](../01_기능명세서.md) · [ERD](../02_ERD.md) · [API 명세서](../03_API명세서.md)

## 1. 전제

- **모바일 우선 반응형 웹앱(PWA)**. 앱스토어 배포는 하지 않는다.
- 프론트와 백엔드를 분리한다. 백엔드는 API 명세서대로 `TypeScript + Express`, `/api/v1`, JWT Bearer 인증.
- DB는 ERD대로 `PostgreSQL + pgvector`, ORM은 `Prisma`.
- 1차 평가 기간(11/2~11/9) 내내 서버가 잠들지 않아야 한다.

## 2. 한눈에 보기

| 영역 | 선택 |
| --- | --- |
| 공통 | TypeScript, Node.js 22.12+, npm 워크스페이스 |
| 프론트 | React + Vite (SPA), React Router, TanStack Query, Tailwind + shadcn/ui |
| PWA | vite-plugin-pwa (manifest, 홈 화면 추가, 정적 리소스 캐시) |
| 백엔드 | Express 5, zod 4, zod-to-openapi(+Swagger UI), multer, sharp, jsonwebtoken, bcryptjs, express-rate-limit, pino |
| DB | PostgreSQL + pgvector, Prisma 7 (임베딩만 raw SQL), 로컬은 Docker |
| 사진 저장 | S3 호환 스토리지 (Supabase Storage 또는 Cloudflare R2), 비공개 버킷 + 서명 URL |
| AI | `@google/genai` — 속성 추출 Gemini 3.6 Flash(폴백 3.5 Flash), 임베딩 gemini-embedding-2 |
| 메일 | nodemailer + Gmail 앱 비밀번호 (도메인이 있으면 Resend) |
| 배포 | 프론트 Vercel, 백엔드 상시 실행 서버 (Railway / Render 유료 / Fly.io 중 택1), DB Supabase 또는 Neon |
| 품질 | Biome(린트·포맷), Vitest (매칭·판정 로직 단위 테스트) |
| 평가 | `qa/`에 Python 스크립트 (홀드아웃 측정, 로컬 CLIP 비교) |

## 3. 프론트엔드

**React + Vite SPA.** 백엔드가 Express로 분리되어 있으므로 Next.js의 서버 기능은 쓰지 않는다. SEO가 필요 없는 로그인 기반 웹앱이라 SPA로 충분하다.

| 용도 | 라이브러리 | 관련 기능 |
| --- | --- | --- |
| 라우팅 | React Router | 전체 |
| 서버 상태 | TanStack Query | 후보 목록, 알림 폴링(`refetchInterval`) — F-07, F-13 |
| UI | Tailwind, shadcn/ui, Lucide, Pretendard, Sonner | 전체 |
| 사진 촬영 | `<input type="file" accept="image/*" capture="environment">` | F-01 |
| 업로드 전 압축 | browser-image-compression | F-01 "사진 용량이 크면 브라우저에서 줄인다" |
| 위치 | Geolocation API (HTTPS 필수) | F-01 가장 가까운 건물 |
| QR 생성 | qrcode.react | F-11 수령 QR |
| QR 스캔 | qr-scanner 등 카메라 기반 스캐너 | F-11, F-14 관리자 스캔 |
| 차트 | Recharts | F-15 분실 다발 카드 |
| 지도 | Leaflet (직접 래핑, 필요할 때만) | 건물 선택·다발 카드 보조 |
| 폼 검증 | react-hook-form + zod (`packages/shared` 스키마 재사용) | 전체 |

반응형 기준: 360px 모바일을 먼저 만들고, PC에서는 가운데 정렬된 최대 폭 레이아웃으로 깨지지 않게만 한다. 관리자 화면도 같은 앱 안의 `/admin` 경로로 둔다(센터 직원이 휴대폰으로 QR을 스캔하는 상황).

웹 푸시(F-20)는 P2. 아이폰은 홈 화면에 추가해야만 동작하므로 P0 알림은 앱 내 알림 + 폴링으로 처리한다.

## 4. 백엔드

**Express + TypeScript**, 계층은 `routes → services → repositories(Prisma)`로 단순하게 나눈다.

| 용도 | 선택 | 비고 |
| --- | --- | --- |
| 입력 검증 | zod | 요청 본문, AI 응답(4장 고정 계약) 모두 검증 |
| 업로드 | multer (메모리) | `POST /found-items` multipart |
| 이미지 처리 | sharp | 리사이즈, EXIF 제거(위치 정보 미사용 원칙), 블러본 생성 — F-03 |
| 인증 | jsonwebtoken + bcrypt | 비밀번호·인증 코드·QR 토큰은 해시로만 저장 |
| 등록 제한 | express-rate-limit + 지문 해시 | F-01 10분에 5건 (초안) |
| 정기 작업 | node-cron (서버 상시 실행 전제) | 기록 삭제(30일), 보관 기한 만료 — F-12, F-18 |
| 로그 | pino | |

**AI 호출**은 `server/ai` 모듈 하나로 감싸고, 바깥에는 API 명세서 4장의 JSON 형식만 노출한다. 모델 선정 전에는 같은 형식의 가짜 구현으로 개발한다.

## 5. DB와 Prisma

- Prisma는 `vector` 타입을 정식 지원하지 않아 ERD처럼 `Unsupported("vector(N)")`로 선언한다. 이 필드는 Prisma 클라이언트로 읽고 쓸 수 없으므로 **임베딩 저장과 유사도 조회 두 군데만** `$executeRaw` / `$queryRaw`로 작성하고, 한 파일(`repositories/embedding.ts`)에 모은다. 나머지는 전부 일반 Prisma 쿼리로 처리한다.
- 마이그레이션 첫 줄에 `CREATE EXTENSION IF NOT EXISTS vector;`가 필요하다. (`postgresqlExtensions`로 자동 생성됨)
- **Prisma 버전은 7로 고정한다.** npm의 `prisma@latest`가 2026-10-11 기준 8.0 RC를 가리킨다. Prisma 7은 접속 URL을 `prisma.config.ts`에 두고, 클라이언트는 `@prisma/adapter-pg`로 만든다.
- UUID 기본값은 DB의 `gen_random_uuid()`로 만든다. raw SQL·시드에서 직접 INSERT해도 ID가 채워진다.
- 부분 유니크 인덱스는 `partialIndexes` 미리보기 기능으로 스키마에 적고, CHECK 제약은 마이그레이션 SQL에 직접 적는다.
- **임베딩 차원**: pgvector의 HNSW·IVFFlat 인덱스는 `vector` 2000차원까지만 지원한다. 임베딩 모델의 출력 차원을 768 또는 1536으로 줄여 쓰는 걸 기본으로 한다(모델의 출력 차원 지정 지원 여부는 확인 필요). 데이터가 수백 건이면 인덱스 없이 전체 비교해도 충분하다.
- 호스팅: Supabase 또는 Neon(둘 다 pgvector 지원, 무료 티어). Supabase는 사진 저장소까지 한 곳에서 해결된다. 인증은 직접 구현하므로 Supabase Auth는 쓰지 않는다.

## 6. 사진 저장

- 버킷 하나를 **비공개**로 두고, 원본(`image_original_key`)과 블러본(`image_public_key`)을 다른 경로에 저장한다.
- 클라이언트에는 항상 **서명 URL(10분, 초안)**만 내려준다. 분실자에게는 블러본만, 관리자에게만 원본을 준다.
- Supabase Storage 또는 Cloudflare R2(S3 호환) 중 DB 호스팅에 맞춰 고른다.

## 7. 배포

| 대상 | 추천 | 이유 |
| --- | --- | --- |
| 프론트 | Vercel | 정적 SPA, HTTPS 기본 제공(위치·카메라 권한에 필수), PR 미리보기 |
| 백엔드 | 상시 실행 서버 | AI 처리를 요청 안에서 끝내는 구조(최대 10초)와 node-cron 때문에 서버리스보다 상시 서버가 맞다. 무료 서버는 잠들기 때문에 평가 기간에는 월 5~7달러 수준의 유료 플랜을 쓰거나, 최소한 외부 핑으로 깨워 둔다 |
| DB·스토리지 | Supabase (또는 Neon + R2) | 무료 티어 |

프론트와 백엔드 도메인이 다르므로 Express에 CORS 허용 도메인을 설정한다. 토큰은 Bearer 헤더 방식이라 쿠키 설정은 필요 없다.

## 8. 레포 구조

```
.
├── frontend/          # React + Vite (은열)
├── backend/           # Express + Prisma (윤호)
│   ├── prisma/
│   └── src/{routes,services,repositories,ai,lib}
├── packages/shared/   # zod 스키마·타입 (API 요청/응답, AI 응답 계약, 에러 코드)
├── qa/                # 테스트 세트, 평가 스크립트 (Python)
└── docs/
```

npm 워크스페이스로 묶어 `frontend`와 `backend`가 `packages/shared`를 같이 import한다. API 명세서의 요청·응답 형식을 여기 zod 스키마로 옮기면 명세와 코드가 어긋나지 않는다.

## 9. 쓰지 않는 것

- **Next.js**: 백엔드가 Express로 분리되어 있어 필요 없다.
- **Supabase Auth**: 학교 이메일 인증 코드·체험 로그인·관리자 계정을 명세대로 직접 구현한다.
- **별도 벡터 DB**(Pinecone 등): 데이터 규모상 pgvector로 충분하다.
- **WebSocket 실시간 알림**: P0는 폴링으로 충분하다.
- **react-leaflet, YOLO**: 라이선스 문제 (`docs/design/REFERENCES.md`).

## 10. 확정이 필요한 것

- [ ] 백엔드 호스팅 업체와 평가 기간 유료 플랜 사용 여부
- [ ] DB·스토리지: Supabase 하나로 갈지, Neon + R2로 갈지
- [ ] 인증 메일 발송 계정 (학교 메일 서버가 Gmail 발송을 스팸 처리하는지 확인)
- [ ] 임베딩 차원 (768 / 1536)
- [ ] Gemini 무료/유료 티어 (무료는 데이터가 학습에 쓰일 수 있어 마스킹 범위가 달라진다)
