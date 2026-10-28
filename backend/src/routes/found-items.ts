import {
  AnalyzeFoundItemFields,
  AnalyzeFoundItemResponse,
  ConfirmFoundItemBody,
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
import { requireCaptcha } from "../middlewares/captcha";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import {
  analyzeFoundItem,
  confirmFoundItem,
  DRAFT_TTL_MINUTES,
  registerFoundItem,
  uploaderFingerprint,
} from "../services/found-items";
import { revealFoundItem } from "../services/reveal";

const consentFieldsDoc = {
  consentVersion: z.string().meta({ description: "동의 화면 버전 (CONSENT_VERSION)" }),
  consentExternalAi: z.enum(["true"]).meta({ description: "사진의 외부 AI 처리 동의 (필수)" }),
  consentLocation: z.enum(["true", "false"]).optional().meta({ description: "위치 사용 동의" }),
};
const placeFieldsDoc = {
  buildingId: z
    .number()
    .int()
    .optional()
    .meta({ description: "주운 건물. IN_PLACE면 필수, HANDED_OVER면 모를 때 비움" }),
  storageType: z.enum(["IN_PLACE", "HANDED_OVER"]),
  storagePlaceId: z.number().int().optional().meta({ description: "HANDED_OVER면 필수" }),
  floor: z.number().int().optional().meta({ description: "습득 층, 지하는 음수" }),
  locationDetail: z.string().max(200).optional().meta({ description: "자세한 위치. 판정 통과 후에만 보인다" }),
};

registry.registerPath({
  method: "post",
  path: "/found-items/analyze",
  tags: ["습득물"],
  summary: "두 단계 등록 1: 사진 분석 (F-01, F-02, F-03)",
  description: [
    "사진만 먼저 받아 가리기·AI 분석을 하고 확정 전(ANALYZING)으로 저장한다. 응답의 category로 등록 화면에 물건 이름을 보여 준다.",
    `${DRAFT_TTL_MINUTES}분 안에 confirm하지 않으면 사진까지 지운다. 확정 전에는 후보·알림에 나오지 않는다.`,
    "AI가 실패하면 category가 null이고 confirm하면 검토 대기(REVIEW)가 된다. 동의와 캡차(X-Captcha-Token 헤더)가 필요하다.",
  ].join(" "),
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            image: z.string().meta({ format: "binary", description: "사진 1장" }),
            ...consentFieldsDoc,
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "분석됨", content: { "application/json": { schema: AnalyzeFoundItemResponse } } },
    400: errorResponse("VALIDATION_ERROR, CAPTCHA_FAILED"),
    413: errorResponse("IMAGE_TOO_LARGE"),
    422: errorResponse("NO_OBJECT_DETECTED"),
    429: errorResponse("RATE_LIMITED"),
  },
});

registry.registerPath({
  method: "post",
  path: "/found-items/{id}/confirm",
  tags: ["습득물"],
  summary: "두 단계 등록 2: 위치·보관 방식 확정",
  description:
    "analyze 응답의 confirmToken과 위치를 보내 등록을 끝낸다. 응답은 POST /found-items와 같다. 귀중품(isValuable)은 storageType이 HANDED_OVER여야 하고, IN_PLACE면 400 VALUABLE_HAND_OVER_REQUIRED이며 초안은 남아 다시 확정할 수 있다.",
  request: {
    params: FoundItemIdParams,
    body: { content: { "application/json": { schema: ConfirmFoundItemBody } } },
  },
  responses: {
    201: {
      description: "등록됨 (REGISTERED 또는 REVIEW)",
      content: { "application/json": { schema: RegisterFoundItemResponse } },
    },
    400: errorResponse("VALIDATION_ERROR, VALUABLE_HAND_OVER_REQUIRED"),
    404: errorResponse("NOT_FOUND: 없거나, 토큰이 틀리거나, 확정 시간이 지남"),
    409: errorResponse("ALREADY_CONFIRMED"),
  },
});

registry.registerPath({
  method: "post",
  path: "/found-items",
  tags: ["습득물"],
  summary: "습득물 한 번에 등록 (F-01, F-02, F-03)",
  description: [
    "로그인 없이 사진과 위치를 한 번에 등록한다. 물건 이름을 먼저 보여 주려면 analyze → confirm 두 단계를 쓴다. 응답에는 공개 정보만 담는다.",
    "AI 분석이 실패해도 201로 응답하고 status가 REVIEW다.",
    `사진은 ${MAX_IMAGE_MB}MB 이하 JPG·PNG·WEBP·HEIC. 같은 기기·IP는 10분에 5건까지.`,
    "동의(외부 AI 처리)와 캡차(X-Captcha-Token 헤더)가 필요하다.",
    "AI가 귀중품으로 보는데 IN_PLACE면 사진을 저장하지 않고 400 VALUABLE_HAND_OVER_REQUIRED. AI가 실패하면(REVIEW) 막지 않는다.",
  ].join(" "),
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            image: z.string().meta({ format: "binary", description: "사진 1장" }),
            ...placeFieldsDoc,
            ...consentFieldsDoc,
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
    400: errorResponse("VALIDATION_ERROR, CAPTCHA_FAILED, VALUABLE_HAND_OVER_REQUIRED"),
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

  router.post(
    "/found-items",
    requireCaptcha(),
    uploadImage,
    validate("body", RegisterFoundItemFields),
    async (req, res) => {
      if (!req.file) {
        throw new AppError("VALIDATION_ERROR", "사진을 올려 주세요.", [{ path: "image", message: "필수" }]);
      }
      const result: RegisterFoundItemResponse = await registerFoundItem({
        image: req.file.buffer,
        fields: res.locals.body,
        fingerprint: uploaderFingerprint(req.ip ?? "", req.get("user-agent") ?? ""),
      });
      res.status(201).json(result);
    },
  );

  router.post(
    "/found-items/analyze",
    requireCaptcha(),
    uploadImage,
    validate("body", AnalyzeFoundItemFields),
    async (req, res) => {
      if (!req.file) {
        throw new AppError("VALIDATION_ERROR", "사진을 올려 주세요.", [{ path: "image", message: "필수" }]);
      }
      const result: AnalyzeFoundItemResponse = await analyzeFoundItem({
        image: req.file.buffer,
        fields: res.locals.body,
        fingerprint: uploaderFingerprint(req.ip ?? "", req.get("user-agent") ?? ""),
      });
      res.status(201).json(result);
    },
  );

  // 캡차는 analyze에서 이미 받았다. confirmToken이 그 기기임을 보인다
  router.post(
    "/found-items/:id/confirm",
    validate("params", FoundItemIdParams),
    validate("body", ConfirmFoundItemBody),
    async (_req, res) => {
      const result: RegisterFoundItemResponse = await confirmFoundItem(res.locals.params.id, res.locals.body);
      res.status(201).json(result);
    },
  );

  router.get("/found-items/:id/detail", requireMember(), validate("params", FoundItemIdParams), async (_req, res) => {
    const { userId, role } = getAuth(res);
    const result: FoundItemDetailResponse = await revealFoundItem({ userId, role }, res.locals.params.id);
    res.json(result);
  });

  return router;
}
