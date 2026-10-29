import type { AiFeature } from "@chajeumpyo/shared";

/**
 * 확인 질문 문구 (F-09). 한두 단어로 답할 수 있는 특징만 고른다.
 * 질문에는 특징의 종류만 드러나고 값은 드러나지 않는다. 물건 이름을 앞에 붙여 무엇을 떠올리면 되는지 이끈다.
 */
const TEMPLATES: Record<string, string> = {
  sticker: "에 붙어 있는 스티커는 어떤 그림이나 글자인가요?",
  keyring: "에 달려 있는 키링은 어떤 모양인가요?",
  text: "에 적혀 있는 글자는 무엇인가요?",
  engraving: "에 새겨진 글자는 무엇인가요?",
  case: "의 케이스는 어떤 색이나 무늬인가요?",
  scratch: "의 흠집은 어느 쪽에 있나요?",
  contents: " 안에 들어 있던 물건은 무엇인가요?",
  pattern: "에 있는 무늬나 장식은 어떤 모양인가요?",
};

/** 질문할 수 있는 특징인지 */
export function isAskable(feature: AiFeature): boolean {
  return feature.key in TEMPLATES;
}

/** itemName: 물건 이름(예: "안경·선글라스"). 가운뎃점 앞만 쓴다("이 안경에 ..."). 없으면 "이 물건" */
export function questionFor(feature: AiFeature, itemName?: string | null): string {
  const tail = TEMPLATES[feature.key];
  if (!tail) return "물건의 특징을 한두 단어로 알려 주세요.";
  return `이 ${itemName?.split("·")[0]?.trim() || "물건"}${tail}`;
}

/**
 * 객관식 오답 보기 (AI가 보기를 못 만들 때 쓴다). 다른 습득물의 특징은 쓰지 않는다(그 물건의 숨은 특징이 새지 않게).
 * 정답과 겹치는 보기는 고를 때 뺀다.
 */
export const PRESET_DISTRACTORS: Record<string, string[]> = {
  sticker: ["곰돌이 캐릭터 스티커", "학교 로고 스티커", "하트 모양 스티커", "영문 글자 스티커", "별 모양 스티커"],
  keyring: ["곰 인형 키링", "하트 모양 금속 키링", "캐릭터 고무 키링", "방울 달린 키링", "별 모양 아크릴 키링"],
  text: ["영문 이니셜", "전화번호 뒷자리", "학번 숫자", "한글 이름", "짧은 영어 문구"],
  engraving: ["영문 이니셜", "날짜 숫자", "하트 모양", "한글 이름", "짧은 영어 문장"],
  case: ["투명 젤리 케이스", "검정 가죽 케이스", "분홍 실리콘 케이스", "체크 무늬 케이스", "카드 수납 케이스"],
  scratch: ["왼쪽 위 모서리", "오른쪽 아래 모서리", "뒷면 가운데", "옆면 버튼 근처", "앞면 위쪽"],
  contents: ["교통카드 한 장", "현금과 영수증", "학생증과 카드 두 장", "립밤과 이어폰", "열쇠 하나"],
  pattern: ["체크 무늬", "줄무늬", "꽃무늬 장식", "금속 로고 장식", "작은 별 무늬"],
};

/** 색 질문 문구 */
export function colorQuestionFor(itemName?: string | null): string {
  return `이 ${itemName?.split("·")[0]?.trim() || "물건"}은 무슨 색인가요?`;
}
