# 시드 데이터

`npm run db:seed`가 이 폴더의 JSON을 읽어 DB에 넣는다. 이름(`name`) 기준으로 덮어쓰므로 여러 번 실행해도 된다.

| 파일 | 내용 | 채울 사람 |
| --- | --- | --- |
| `buildings.json` | 건물 이름, 중심 좌표(위도·경도), 표시 순서 | 기획 (기능 명세서 7장 "건물 목록과 좌표") |
| `storage-places.json` | 보관처 이름, 건물 이름, 위치 안내 문구, `CENTER`/`GUARD` | 기획 |

건물 좌표는 OpenStreetMap에서 캠퍼스 안 `building=university` 건물 윤곽의 중심을 뽑았다 (2026-10-28, © OpenStreetMap contributors, ODbL). 건물 이름도 OSM 표기를 따랐다. 생활관은 OSM의 "서경대학교 생활관3동" 위치다.

**보관처는 임시다.** 실제로 분실물을 받는 곳이 정해지기 전까지 센터 1곳·경비실 2곳을 넣어 두었고, 안내 문구에 "(임시)"를 붙였다. 정해지면 이 파일만 고치고 `npm run db:seed`를 다시 돌리면 이름 기준으로 덮어쓴다.

```json
// buildings.json 형식
[{ "name": "건물 이름", "lat": 37.0, "lng": 127.0, "sortOrder": 1 }]

// storage-places.json 형식
[{ "name": "종합서비스센터", "building": "건물 이름", "guideText": "1층 정문 옆", "org": "CENTER" }]
```
