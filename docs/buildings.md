> **초안 (팀 확인 전)**

# 서경대학교 캠퍼스 건물 목록 (찾음표용 초안)

서울시 성북구 서경로 124 (정릉동 16-1). 캠퍼스 중심 좌표: 37.6148855, 127.0133508 (공식 캠퍼스맵 페이지 내 지도 좌표, [S1]).
건물별 좌표·건물번호는 공식 페이지 텍스트에서 확인되지 않아 전부 **미확인**. 모든 건물은 지하주차장/지하통로로 연결됨 [S4].

| id | 이름 | 건물번호 | 층 범위 | 분실물 핫스팟 (출처) | 좌표 |
|---|---|---|---|---|---|
| `yudam` | 유담관 | 미확인 | B?~15F (최고층 15F는 [S6]; 지하층 수 미확인, 4·13층 없음 [S6]) | 학술정보관(도서관) 7~8F, 자유열람실 9F, 학술세미나실 6F(L층) [S2][S4]; 신한은행 3F(학생증 발급) [S4]; 매점 9F [S8]; 강의실 10F~ [S4] | 미확인 |
| `cheongun` | 청운관 | 미확인 | 미확인 | 1F 편의점(이마트24)·학생식당 [S4]; 3F 학생과·보건진료소 [S3][S4]; L층 인쇄소·서점 [S4]; 청운홀 [S3]; 동아리방 [S4] | 미확인 |
| `bukak` | 북악관 | 미확인 | B1~9F 이상 (B1·9F 존재 확인 [S6], 최고층 미확인) | B1 GS25·식당 [S4][S6]; 1F~ 강의실 [S3][S6]; 2F 컴퓨터실 [S6]; 9F 소극장 [S6] | 미확인 |
| `hyein` | 혜인관 | 미확인 | ?~7F (7층까지 증축 [S6]; 지하 미확인) | 강의실(인문사회·교양) [S3][S6] | 미확인 |
| `bongwan` | 본관 | 미확인 | 미확인 (2층 존재 [S4]) | 1F 행정·경리 [S8, 비공식] | 미확인 |
| `hanrim` | 한림관 | 미확인 | 미확인 | 식당 [S8, 비공식] | 미확인 |
| `eunju` | 은주관(은주1·2관) | 미확인 | 미확인 | 미확인 | 미확인 |
| `daeil` | 대일관 | 미확인 | 미확인 | 미확인 | 미확인 |
| `sangseung` | 상승관 | 미확인 | 미확인 | 미확인 | 미확인 |
| `suin` | 수인관 | 미확인 | 미확인 | 미확인 | 미확인 |
| `munye` | 문예관 | 미확인 | 미확인 | 미확인 | 미확인 |

비고: 건물 목록 자체(특히 본관 외 은주·대일·상승·수인·문예·한림관)는 나무위키/우만위키 기준 [S6][S7]이며, 공식 캠퍼스맵 텍스트로는 대조하지 못함(지도가 이미지/스크립트) → 팀 확인 필요. id 슬러그는 임의 로마자 표기안.

## JSON

```json
[
  {"id": "yudam", "name": "유담관", "floors": {"min": null, "max": 15}, "lat": null, "lng": null},
  {"id": "cheongun", "name": "청운관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "bukak", "name": "북악관", "floors": {"min": -1, "max": null}, "lat": null, "lng": null},
  {"id": "hyein", "name": "혜인관", "floors": {"min": null, "max": 7}, "lat": null, "lng": null},
  {"id": "bongwan", "name": "본관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "hanrim", "name": "한림관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "eunju", "name": "은주관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "daeil", "name": "대일관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "sangseung", "name": "상승관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "suin", "name": "수인관", "floors": {"min": null, "max": null}, "lat": null, "lng": null},
  {"id": "munye", "name": "문예관", "floors": {"min": null, "max": null}, "lat": null, "lng": null}
]
```
(floors: 지하는 음수, null = 미확인. 북악관 max는 9 이상으로 추정되나 미확인이라 null.)

## 출처

- [S1] 공식 캠퍼스맵: https://www.skuniv.ac.kr/campus-map
- [S2] 공식 학술정보관: https://www.skuniv.ac.kr/library
- [S3] 공식 FAQ 공간사용신청: https://www.skuniv.ac.kr/faq/52083 (및 https://www.skuniv.ac.kr/resources/59382)
- [S4] 공식 서경 TODAY: https://www.skuniv.ac.kr/sku-today/46118
- [S6] 나무위키(비공식): https://namu.wiki/w/서경대학교/캠퍼스
- [S7] 우만위키(비공식): https://tcatmon.com/wiki/서경대학교/시설
- [S8] 블로그(비공식): https://www.bruningbros.com/서경대학교-캠퍼스-구조와-시설-총정리/
