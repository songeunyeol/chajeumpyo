# 찾음표 디자인 CLI 프롬프트 (10/12 통합본)

아래 전체를 CLI에 붙여 넣는다.

```
디자인 전에 아래 파일을 먼저 읽고 기준으로 삼아:
- docs/design/REFERENCES.md: 레퍼런스, 지도(네이버 Dynamic Map), 키 규칙
- qa/CANONICAL-AC-PACK.md: 통과 기준. 화면 기준은 B4, B7, B10, B12, B14, B15, B17, W2, W5
  상태 화면 4개는 꼭 만들 것:
  B10 잠금(물건 단위 3회 실패), B7 확인 전 흐린 사진 후보 카드,
  B14 건물 한 번에 고치기, B15 동의 화면(연락처·위치·외부 AI)
- docs/security/THREAT-MODEL.md: 화면에 보여 주면 안 되는 정보 (T6, T13, T14)
- PR #21 디자인 2차 코멘트 5가지: https://github.com/songeunyeol/chajeumpyo/pull/21#issuecomment-6120099940
  (흐린→선명 사진 카드, 가입 방식별 동의 화면, 학교 이메일+구글·카카오·네이버 로그인, LOST112 20종·12색, 건물 핀 지도)
- docs/api/LOST112.md: 종류 20개·기본색 12개 (아이콘, 색 칩 기준). 우산·텀블러·열쇠·필기구도 각자 아이콘 필요
- 인증 코드 입력 화면: 6자리, 5분 타이머, 다시 받기, 5회 틀리면 폐기 (T14)
윤호 샘플은 화면 구성만 참고하고 스타일은 새로 잡아. 모바일 360px 먼저.

[지도·API]
- 네이버 지도 로고는 끌 수 없으니 지도 카드 오른쪽 아래를 가리지 말 것
- 지도 키 인증 실패 시 보여 줄 건물 목록 화면도 디자인할 것
- LOST112 습득물 사진은 링크로만 보여 주고 아래에 "출처: 경찰청 LOST112" 표시

[레퍼런스: 여기서만 고를 것]
전체 목록: 옵시디언 C:\Users\song\vault\Brain\디자인·개발 레퍼런스.md,
노션 DB https://app.notion.com/p/3e8ec5842c8545eaa11051385b2a3c66 (연결 안 되면 옵시디언만)
1) 톤(참고만, 복사 금지): Refero https://refero.design, Kombai Gallery, frontend-design 스킬 체크리스트
2) 구현 재료: shadcn/ui https://ui.shadcn.com (이름·토큰 맞추기), Input OTP (autocomplete="one-time-code", inputmode="numeric"),
   Pretendard, Lucide(아이콘은 이것만, 이모지 금지), Motion, Sonner, react-dropzone, Recharts
3) 포인트(첫 화면에만 1~2개, 분실자 흐름 금지): React Bits(무료만), Vengeance UI
4) 금지: react-leaflet, Ultralytics YOLO, OpenMontage, 라이선스 모르는 Figma 키트, 토스·당근 그대로 따라 하기
목록에 없는 라이브러리는 이름·라이선스·이유를 먼저 물어볼 것.
톤 후보 2~3개를 먼저 보여 주고, 내가 고르면 토큰(색·글자·간격·둥글기)부터 만들 것.

[보안: 화면에 절대 넣지 말 것]
- 숨은 특징의 실제 값은 어디에도 표시 금지. 확인 화면엔 질문만
- 확인 실패 화면엔 남은 횟수만. 무엇이 틀렸는지 표시 금지
- 지도·목록엔 건물 핀만. 자세한 위치는 확인 통과자에게만
- 코드 요청 화면은 가입 여부와 상관없이 항상 "코드를 보냈어요". "이미 가입된 이메일" 문구 금지
- 선명한 사진 화면엔 "링크는 10분 뒤 만료" 안내, 저장 버튼 없음
- 샘플 데이터는 가짜 이름·학번·전화번호만. 실제 사람 사진·학생증 금지
```
