import type { RequestHandler } from "express";
import type { z } from "zod";
import { AppError } from "../lib/errors";

type Source = "body" | "query" | "params";

/**
 * zod 스키마로 요청을 검증한다. 통과하면 변환된 값을 res.locals[source]에 담는다.
 * (Express 5에서 req.query는 읽기 전용이라 덮어쓰지 않는다.)
 */
export function validate<S extends z.ZodType>(source: Source, schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      next(new AppError("VALIDATION_ERROR", "입력 형식이 올바르지 않아요.", details));
      return;
    }
    res.locals[source] = result.data;
    next();
  };
}
