# 화면별 레퍼런스·UI 도구 (레퍼런스 봇, 2026-10-07)

★ 수는 GitHub 기준 2026-10-07 조회. 모르는 건 전부 미확인. 설치·실행은 안 해봄.

## 1. 습득물 등록 (사진 업로드 + AI 태그 수정)
- **react-dropzone** — https://github.com/react-dropzone/react-dropzone · 무료 · MIT · 11,012★ · 드래그/탭 업로드. 모바일은 `<input capture>`로 카메라 바로 열림
- **shadcn/ui** (Form·Badge·Select·Card) — https://ui.shadcn.com · 무료 · MIT · 125,244★ · AI가 뽑은 종류/색/모양 태그를 Badge·Select로 고치게
- 레퍼런스: Mobbin에서 "upload photo", "edit tags" 플로우 검색 (https://mobbin.com · 일부 유료)

## 2. 분실 검색 + 매칭 결과
- **shadcn/ui** (Textarea·Card·Progress) — 설명 입력창 + 후보 카드에 일치도 바·이유 표시
- **nuqs** — https://github.com/47ng/nuqs · 무료 · MIT · 10,874★ · 검색어·필터를 URL에 저장, 결과 공유/뒤로가기 안 깨짐
- **Motion** — https://motion.dev · 무료 · MIT · 33,853★ · 후보 카드 순차 등장
- 레퍼런스: 당근 검색결과 카드 구성, 대화 입력 → 결과 카드 패턴 (Mobbin "search results")

## 3. 본인 확인 (질문 플로우 + 잠긴 위치 공개)
- **shadcn/ui** (Dialog·RadioGroup·Input OTP·Alert) — 질문 1개씩 단계 진행, 통과 전 위치는 블러/자물쇠
- **Motion** — 잠금 해제 애니메이션
- 원칙: 학번·카드번호 저장 안 함. "숨은 특징" 질문만 (예: 케이스 스티커, 키링)
- 레퍼런스: 토스 본인확인 단계 화면, 중고거래 앱 거래 인증 플로우 (Mobbin)

## 4. 교내 지도 (건물 핀, P0 · 10/12 결정)
- **네이버 클라우드 Maps (Dynamic Map)** — https://www.ncloud.com/product/applicationService/maps · 1순위. `maps.js?ncpKeyId=`로 로드, 키는 `NEXT_PUBLIC_` 환경변수(공개 키). Client Secret은 어디에도 넣지 않음
- 웹 서비스 URL: `http://localhost:3000` + 실제 배포 도메인만(www 제외, Vercel 미리보기 주소 금지, 테스트 주소는 개발 후 삭제)
- 핀은 건물 테이블의 미리 넣은 건물 좌표에만. 분실물 API 응답엔 `buildingId`만, 위도·경도 금지(QA B17, 위협모델 T6)
- 키 인증 실패(`navermap_authFailure`) 시 건물 목록 화면으로 대체(B17 통과 기준)
- 이전 안 Leaflet/MapLibre는 폐기. ⚠️ react-leaflet(Hippocratic 2.1)도 사용 안 함

## 5. 관리자 대시보드 (차트 + 히트맵)
- **Recharts** — https://github.com/recharts/recharts · 무료 · MIT · 27,615★ · 시간대·요일별 분실 차트. shadcn 차트 기반
- **heatmap.js** — https://github.com/pa7/heatmap.js · 무료 · MIT · 6,384★ · 장소별 분실 히트맵. 최근 유지보수 미확인
- 레퍼런스: shadcn/ui Blocks dashboard 예시 (https://ui.shadcn.com/blocks)

## 6. 공통
- **Lucide** — https://lucide.dev · 무료 · ISC · 이모지 대신 기본 아이콘
- **Pretendard** — https://github.com/orioncactus/pretendard · 무료 · SIL OFL 1.1 · 한글 기본 폰트, 상업용 OK
- **Sonner** — https://github.com/emilkowalski/sonner · 무료 · MIT · 13,024★ · "등록 완료" 토스트
- **shadcn/ui Skeleton** — AI 분석·매칭 대기 중 뼈대 로딩

## 디자인 방향 참고
- **Refero Styles** — https://styles.refero.design · 무료 열람 · 라이선스 표기 없음(미확인). 2~3개 섞어 참고만, 특정 브랜드 그대로 따라 하지 않기
- **Kombai Gallery** — 무료, Kombai 이용약관상 참고용
- **frontend-design skill** — Apache-2.0

## 피할 것
- ⚠️ Ultralytics YOLO — AGPL-3.0
- ⚠️ OpenMontage — AGPL-3.0
- ⚠️ react-leaflet — Hippocratic 2.1
- Flutter 전용(fl_chart, Skeletonizer, shadcn_ui Flutter)은 웹엔 해당 없음

## 은채용 디자인 시작 가이드
1. Figma Community에서 "shadcn/ui" 키트 복제 → 개발 컴포넌트랑 이름 맞추기 (키트별 라이선스는 받을 때 확인)
2. Mobbin에서 "lost and found", "upload", "search results", "verification" 화면 3~5개씩 캡처 → 무드보드
3. 폰트 Pretendard, 아이콘 Lucide 고정
4. 순서: 등록 → 검색 결과 카드 → 본인 확인 → 동의 화면 → 지도. 모바일 360px 먼저

## 미확인
- Mobbin 정확한 요금, Figma 커뮤니티 키트 라이선스, heatmap.js 유지보수 상태, Refero Styles 라이선스
