# 시드 데이터

`npm run db:seed`가 이 폴더의 JSON을 읽어 DB에 넣는다. 이름(`name`) 기준으로 덮어쓰므로 여러 번 실행해도 된다.

| 파일 | 내용 | 채울 사람 |
| --- | --- | --- |
| `buildings.json` | 건물 이름, 중심 좌표(위도·경도), 표시 순서 | 기획 (기능 명세서 7장 "건물 목록과 좌표") |
| `storage-places.json` | 보관처 이름, 건물 이름, 위치 안내 문구, `CENTER`/`GUARD` | 기획 |

좌표는 지도 앱에서 건물 중심을 찍어 소수점 6자리까지 적는다. 아직 확정 전이라 비워 두었다.

```json
// buildings.json 형식
[{ "name": "건물 이름", "lat": 37.0, "lng": 127.0, "sortOrder": 1 }]

// storage-places.json 형식
[{ "name": "종합서비스센터", "building": "건물 이름", "guideText": "1층 정문 옆", "org": "CENTER" }]
```
