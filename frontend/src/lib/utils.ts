import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** index.css @theme의 이름 붙인 값. 등록해야 p-0이 px-gutter를, text-small이 text-[15px]를 제대로 덮는다 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["gutter", "touch", "btn", "input", "header", "tabbar"],
      text: ["caption", "small", "body", "body-lg", "title", "headline", "display"],
      container: ["app", "admin"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
