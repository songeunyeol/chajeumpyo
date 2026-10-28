# AI 전송 전 가리기 모델 (QA B3, 위협모델 T4)

`src/privacy/premask.ts`가 이 서버 안에서만 쓴다. 사진은 밖으로 나가지 않는다.

| 파일 | 용도 | 출처 | 라이선스 | SHA-256 |
|---|---|---|---|---|
| `face-ultralight-rfb320.onnx` | 얼굴 영역 | [Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB) `models/onnx/version-RFB-320.onnx` | MIT | `34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017` |
| `text-ppocrv4-det.onnx` | 글자 영역(읽지 않고 자리만) | PaddleOCR PP-OCRv4 det, ONNX 변환본 [SWHL/RapidOCR](https://huggingface.co/SWHL/RapidOCR) `PP-OCRv4/ch_PP-OCRv4_det_infer.onnx` | Apache-2.0 | `d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9` |

바꿀 때는 같은 이름으로 넣고 해시를 고친 뒤 `npx vitest run premask found-items`로 확인한다.
배포할 때 이 폴더가 `dist/`와 같은 `backend/` 안에 있어야 한다.

## 10/27 시험 결과 (공개 사진 10장 + 합성 4장, 한 장 0.1~0.15초)
- 카드번호·이름·학번, 지갑 속 면허증 글자: 모두 가림
- 얼굴: 4명·5명 단체 사진에서 모두 가림
- 글자 없는 물건(에어팟, 우산, 텀블러, 가방, 안경, 열쇠): 몸통을 가리지 않음
- 남는 것: 휴대폰 화면의 아주 큰 숫자(시계)처럼 한 줄이 매우 큰 글자는 남을 수 있다. AI 응답의 민감 영역으로 공개본에서 한 번 더 가린다.
