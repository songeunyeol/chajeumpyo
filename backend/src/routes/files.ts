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
    // 화면(정적 사이트)이 API와 다른 주소에서 열려도 <img>로 보이게 한다. helmet 기본값(same-origin)이면 브라우저가 막는다.
    // 링크 자체가 서명·만료로 보호되므로 출처 제한은 풀어도 된다.
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
