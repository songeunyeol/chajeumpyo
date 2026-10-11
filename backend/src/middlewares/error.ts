import type { ErrorResponse } from "@chajeumpyo/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("NOT_FOUND", "요청한 경로를 찾을 수 없어요."));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ErrorResponse = { error: { code: err.code, message: err.message, details: err.details } };
    res.status(err.status).json(body);
    return;
  }
  // express.json()의 본문 파싱 실패
  if (err?.type === "entity.parse.failed") {
    const body: ErrorResponse = { error: { code: "VALIDATION_ERROR", message: "JSON 형식이 올바르지 않아요." } };
    res.status(400).json(body);
    return;
  }
  logger.error({ err }, "unhandled error");
  const body: ErrorResponse = { error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했어요." } };
  res.status(500).json(body);
};
