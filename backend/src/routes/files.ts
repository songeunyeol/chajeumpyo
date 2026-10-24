import { Router } from "express";
import { AppError } from "../lib/errors";
import { readLocalFile, verifySignature } from "../storage/local";

/** 로컬 저장소 파일 내려주기. 서명이 맞고 만료 전인 요청만. (/api/v1 밖, /files/*) */
export function createFilesRouter() {
  const router = Router();
  router.get("/files/*key", async (req, res) => {
    const key = (req.params as { key: string[] }).key.join("/");
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig ?? "");
    if (!verifySignature(key, exp, sig)) throw new AppError("FORBIDDEN", "만료됐거나 잘못된 링크예요.");
    const data = await readLocalFile(key);
    if (!data) throw new AppError("NOT_FOUND", "파일이 없어요.");
    // 프론트(다른 출처)의 <img>가 띄울 수 있게 이 경로만 cross-origin. 접근 통제는 서명·만료가 한다.
    // (helmet 기본값 same-origin은 /api/v1 등 나머지 응답에 그대로 둔다)
    res
      .set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
        "Cross-Origin-Resource-Policy": "cross-origin",
      })
      .send(data);
  });
  return router;
}
