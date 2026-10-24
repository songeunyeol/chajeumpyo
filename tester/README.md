# ⚠️ 임시 API 테스터 (더미 코드) — 프론트 개발이 시작되면 이 폴더를 통째로 지운다

> **삭제 조건**: `frontend/`에 실제 화면이 하나라도 백엔드와 연결되면 `tester/` 폴더 전체를 지운다 (이슈 #31).
> 이 폴더의 코드는 디자인·구조·코드 품질 기준을 따르지 않는다. 프론트에서 참고하거나 옮겨 쓰지 않는다.
> 백엔드·shared 코드는 이 폴더를 import하지 않는다. 지워도 다른 곳은 아무 영향이 없다.

백엔드 기능(F-01~F-15)을 브라우저에서 직접 눌러 보기 위한 한 장짜리 HTML이다. 빌드 없음, 의존성 없음.

## 실행

```bash
npm run db:up                       # DB
npm run dev                         # API (http://localhost:4000)
npm run seed:dev -w backend         # 테스트용 건물·보관처·관리자·습득물 (backend/scripts/seed-dev.ts, 개발 DB에만, 여러 번 돌려도 됨)
python3 -m http.server 5173 -d tester         # 테스터 (http://localhost:5173)
```

- 포트 5173은 `.env`의 `CORS_ORIGIN` 기본값과 같아서 따로 설정할 게 없다
- 가입 인증 코드는 `MAIL_MODE=console`이라 API 서버 로그에 찍힌다
- `AI_MODE=mock`이면 사진과 상관없이 "흰색 애플 이어폰, 곰돌이 스티커"로 분석된다. 다른 물건은 관리자 탭에서 속성을 고쳐서 만든다

## 테스트 계정 (backend/scripts/seed-dev.ts가 만든다)

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 종합서비스센터 관리자 (전체 관리) | center@skuniv.ac.kr | admin1234! |
| 유담관 경비실 관리자 | guard@skuniv.ac.kr | admin1234! |

분실자는 "체험 로그인"이나 `@skuniv.ac.kr` 이메일 가입으로 만든다.

## seed-dev.ts가 넣는 것

- 건물 6개: 좌표는 캠퍼스 중심 근처 **임의 값** (실제 좌표는 기획에서 받기로 함, #39)
- 보관처 3개, 관리자 2명
- 습득물 7개 (실제 5 + 체험용 시드 2)
