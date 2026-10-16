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
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" }).send(data);
  });
  return router;
}
