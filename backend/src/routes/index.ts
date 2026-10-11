import { Router } from "express";
import { buildingsRouter } from "./buildings";

/** /api/v1 아래 라우터. 기능별 라우터를 여기에 붙인다. */
export const apiRouter = Router();

apiRouter.use(buildingsRouter);
