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
