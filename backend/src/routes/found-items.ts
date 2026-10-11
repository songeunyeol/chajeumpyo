import {
  FoundItemDetailResponse,
  FoundItemIdParams,
  MAX_IMAGE_MB,
  RegisterFoundItemFields,
  RegisterFoundItemResponse,
} from "@chajeumpyo/shared";
import { type RequestHandler, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { getAuth, requireMember } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import { registerFoundItem, uploaderFingerprint } from "../services/found-items";
import { revealFoundItem } from "../services/reveal";

registry.registerPath({
  method: "post",
  path: "/found-items",
  tags: ["습득물"],
  summary: "습득물 등록 (F-01, F-02, F-03)",
  description: [
    "로그인 없이 등록한다. 응답에는 공개 정보만 담는다.",
    "AI 분석이 실패해도 201로 응답하고 status가 REVIEW다.",
    `사진은 ${MAX_IMAGE_MB}MB 이하 JPG·PNG·WEBP·HEIC. 같은 기기·IP는 10분에 5건까지.`,
  ].join(" "),
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            image: z.string().meta({ format: "binary", description: "사진 1장" }),
            buildingId: z.number().int(),
            storageType: z.enum(["IN_PLACE", "HANDED_OVER"]),
            storagePlaceId: z.number().int().optional().meta({ description: "HANDED_OVER면 필수" }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "등록됨 (REGISTERED 또는 REVIEW)",
      content: { "application/json": { schema: RegisterFoundItemResponse } },
    },
    400: errorResponse("VALIDATION_ERROR"),
    413: errorResponse("IMAGE_TOO_LARGE"),
    422: errorResponse("NO_OBJECT_DETECTED"),
    429: errorResponse("RATE_LIMITED"),
  },
});

registry.registerPath({
  method: "get",
  path: "/found-items/{id}/detail",
  tags: ["습득물"],
  security: [{ bearerAuth: [] }],
  summary: "사진·보관 위치 공개 (F-10)",
  description:
    "이 계정이 일치 판정(또는 확인 질문)을 통과한 물건만. 볼 때마다 열람 기록이 남는다. 사진 링크는 10분 뒤 만료.",
  request: { params: FoundItemIdParams },
  responses: {
    200: { description: "상세", content: { "application/json": { schema: FoundItemDetailResponse } } },
    401: errorResponse("UNAUTHORIZED"),
    403: errorResponse("FORBIDDEN: 통과하지 않음"),
    404: errorResponse("NOT_FOUND"),
  },
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 } });

/** 사진 1장을 받고, multer 오류를 명세의 에러 코드로 바꾼다 */
const uploadImage: RequestHandler = (req, res, next) => {
  upload.single("image")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(
        err.code === "LIMIT_FILE_SIZE"
          ? new AppError("IMAGE_TOO_LARGE", `사진은 ${MAX_IMAGE_MB}MB 이하로 올려 주세요.`)
          : new AppError("VALIDATION_ERROR", "사진은 image 필드로 1장만 올려 주세요."),
      );
      return;
    }
    next(err);
  });
};

export function createFoundItemsRouter() {
  const router = Router();

  router.post("/found-items", uploadImage, validate("body", RegisterFoundItemFields), async (req, res) => {
    if (!req.file) {
      throw new AppError("VALIDATION_ERROR", "사진을 올려 주세요.", [{ path: "image", message: "필수" }]);
    }
    const result: RegisterFoundItemResponse = await registerFoundItem({
      image: req.file.buffer,
      fields: res.locals.body,
      fingerprint: uploaderFingerprint(req.ip ?? "", req.get("user-agent") ?? ""),
    });
    res.status(201).json(result);
  });

  router.get("/found-items/:id/detail", requireMember(), validate("params", FoundItemIdParams), async (_req, res) => {
    const { userId, role } = getAuth(res);
    const result: FoundItemDetailResponse = await revealFoundItem({ userId, role }, res.locals.params.id);
    res.json(result);
  });

  return router;
}
