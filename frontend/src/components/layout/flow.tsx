import { useEffect } from "react";

export type Flow = "finder" | "lost" | "demo" | "admin";

/** <body data-flow>로 흐름 색(--flow-*)을 바꾼다 */
export function useFlow(flow: Flow) {
  useEffect(() => {
    const prev = document.body.dataset.flow;
    document.body.dataset.flow = flow;
    return () => {
      if (prev) document.body.dataset.flow = prev;
      else delete document.body.dataset.flow;
    };
  }, [flow]);
}
