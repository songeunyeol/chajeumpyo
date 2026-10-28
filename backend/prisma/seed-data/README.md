# 시드 데이터

`npm run db:seed`가 이 폴더의 JSON을 읽어 DB에 넣는다. 이름(`name`) 기준으로 덮어쓰므로 여러 번 실행해도 된다.

| 파일 | 내용 | 채울 사람 |
| --- | --- | --- |
| `buildings.json` | 건물 이름, 중심 좌표(위도·경도), 표시 순서 | 기획 (기능 명세서 7장 "건물 목록과 좌표") |
| `storage-places.json` | 보관처 이름, 건물 이름, 위치 안내 문구, `CENTER`/`GUARD` | 기획 |

건물 좌표는 OpenStreetMap에서 캠퍼스 안 `building=university` 건물 윤곽의 중심을 뽑았다 (2026-10-28, © OpenStreetMap contributors, ODbL). 건물 이름도 OSM 표기를 따랐다. 생활관은 OSM의 "서경대학교 생활관3동" 위치다.

**보관처는 교무처 한 곳이다** (2026-10-29 팀 결정). 혜인관 1층 교무처, 평일 9~18시, `CENTER`. 예전에 넣었던 임시 보관처(종합서비스센터·유담관 경비실·청운관 경비실)는 뺐다.

시드는 이름 기준으로 덮어쓰기(upsert)만 하고 지우지는 않는다. 그래서 임시 보관처가 이미 들어간 DB에서 다시 돌리면 그 행은 남는다. 운영 DB는 새로 만들어 상관없지만, 예전 로컬 DB는 관리자 화면이나 SQL로 직접 지운다(물건·관리자가 그 보관처를 쓰고 있으면 먼저 옮긴다). 보관처를 바꾸면 `src/services/demo-seed.ts`의 `storagePlace` 이름도 같이 맞춘다.

```json
// buildings.json 형식
[{ "name": "건물 이름", "lat": 37.0, "lng": 127.0, "sortOrder": 1 }]

// storage-places.json 형식
[{ "name": "교무처", "building": "건물 이름", "guideText": "혜인관 1층 교무처 · 평일 9~18시", "org": "CENTER" }]
```
