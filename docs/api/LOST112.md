> **초안 (회의에서 확정 전)**

# LOST112 공공 API (데모 시드용)

> Notion 조사(10/7·10/9)를 레포로 옮긴 요약. 키 값은 커밋하지 말 것 (`.env`의 `DATA_GO_KR_SERVICE_KEY`만).

교내 분실물은 이 API에 없다. 경찰서 접수 전국 데이터라 **시연 시드·외부 공공 데이터 표시**용이다.

## 엔드포인트

| 용도 | data.go.kr | 서비스 URL |
| --- | --- | --- |
| 습득물 | [15058696](https://www.data.go.kr/data/15058696/openapi.do) | `https://apis.data.go.kr/1320000/LosfundInfoInqireService` |
| 분실물 | [15000799](https://www.data.go.kr/data/15000799/openapi.do) | `https://apis.data.go.kr/1320000/LostGoodsInfoInqireService` |
| 공통코드 | [15000651](https://www.data.go.kr/data/15000651/openapi.do) | `getThngClCd` · `getCmmnCd` |

습득물 예: `getLosfundInfoAccToClAreaPd` (분류·지역·기간).

요청 공통: `ServiceKey`, `pageNo`, `numOfRows` + 분류/지역/기간 파라미터.

## 습득물 응답 필드 (확인분)

`resultCode`, `resultMag`, `atcId`, `clrNm`, `depPlace`, `fdFilePathImg`, `fdPrdtNm`, `fdSbjt`, `fdSn`, `fdYmd`, `prdtClNm`, `rnum`

- 습득 **장소 좌표 없음** (보관 경찰서 `depPlace`만). 교내 건물 매칭에 못 씀.
- 사진 URL은 lost112 서버. **복사·미러 금지**, 링크 + `출처: 경찰청 LOST112`.
- 화면에서는 "외부 공공 데이터"로 구분 표시.

## 인증·한도

- 공공데이터포털 서비스키. 개발계정 트래픽 한도 있음.
- 에러 20(키/권한), 22(일일 한도), 23(초당 한도)은 서버에서 처리.

## 코드 (요약)

| 종류 | 예 | 비고 |
| --- | --- | --- |
| 물품 대분류 | `PRA000` 가방, `PRJ000` 휴대폰, `PRG000` 전자기기 … | 대분류 약 20, 중분류 약 73 (화면 기준) |
| 색상 | `CL1001`… (기본 11색은 CL1001–CL1011) | 습득물 API는 색상 코드 1개만 |
| 지역 | 서울 `LCA000` | 시·도 코드만 유효 (하위구는 0건 보고 있음) |

전체 표·출처는 Notion 작업 보드 태스크 [LOST112 습득물·분실물 API 확인](https://app.notion.com/p/3f2dc7667cb7813ea6dfe1e741f79019)에 있음.

## 남은 확인 (키 발급 후)

1. 실제 호출로 전체 오퍼레이션·응답 필드 재확인
2. 공통코드 API로 분류·색상·지역 코드 최신화
3. 시드 30건 파이프라인에 `source: lost112_seed`만 넣고 원문 전체 미러는 하지 않음
