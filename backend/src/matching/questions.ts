import type { AiFeature } from "@chajeumpyo/shared";

/**
 * 확인 질문 문구 (F-09). 한두 단어로 답할 수 있는 특징만 고른다.
 * 질문에는 특징의 종류만 드러나고 값은 드러나지 않는다.
 */
const TEMPLATES: Record<string, string> = {
  sticker: "붙어 있는 스티커는 어떤 그림이나 글자인가요?",
  keyring: "달려 있는 키링은 어떤 모양인가요?",
  text: "적혀 있는 글자는 무엇인가요?",
  engraving: "새겨진 글자는 무엇인가요?",
  case: "케이스는 어떤 색이나 무늬인가요?",
  scratch: "흠집은 어느 쪽에 있나요?",
  contents: "안에 들어 있던 물건은 무엇인가요?",
  pattern: "무늬는 어떤 모양인가요?",
};

/** 질문할 수 있는 특징인지 */
export function isAskable(feature: AiFeature): boolean {
  return feature.key in TEMPLATES;
}

export function questionFor(feature: AiFeature): string {
  return TEMPLATES[feature.key] ?? "물건의 특징을 한두 단어로 알려 주세요.";
}
