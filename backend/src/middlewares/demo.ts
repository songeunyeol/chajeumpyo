import type { RequestHandler } from "express";
import { demoEnabled } from "../config/env";
import { AppError } from "../lib/errors";

/** 체험·시연 기능이 꺼져 있으면(DEMO_MODE) 없는 경로처럼 404 */
export const requireDemoEnabled: RequestHandler = (_req, _res, next) => {
  if (!demoEnabled) return next(new AppError("NOT_FOUND", "찾을 수 없어요."));
  next();
};
