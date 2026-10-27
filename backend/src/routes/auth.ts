import {
  AdminAuthResponse,
  AuthResponse,
  DemoLoginRequest,
  EmailCodeRequest,
  EmailVerifyRequest,
  EmailVerifyResponse,
  LoginRequest,
  MeResponse,
  SignupRequest,
} from "@chajeumpyo/shared";
import { Router } from "express";
import { getAuth, requireMember } from "../middlewares/auth";
import { requireCaptcha } from "../middlewares/captcha";
import { ipRateLimit } from "../middlewares/rate-limit";
import { validate } from "../middlewares/validate";
import { errorResponse, registry } from "../openapi/registry";
import * as auth from "../services/auth";

const json = <T>(schema: T) => ({ content: { "application/json": { schema } } });
const bearer = [{ bearerAuth: [] }];

registry.registerComponent("securitySchemes", "bearerAuth", { type: "http", scheme: "bearer", bearerFormat: "JWT" });

registry.registerPath({
  method: "post",
  path: "/auth/email/code",
  tags: ["인증"],
  summary: "가입 인증 코드 메일 발송 (F-04)",
  description:
    "학교 이메일만. 코드는 6자리, 5분 유효, 1회용. 같은 이메일은 1분에 한 번·하루 10번, 같은 IP는 10분에 10번·하루 50번. " +
    "가입 여부를 드러내지 않도록 이미 가입된 이메일도 204를 주고, 그 경우 코드 대신 로그인 안내 메일을 보낸다.",
  request: { body: json(EmailCodeRequest) },
  responses: {
    204: { description: "발송함 (가입 여부와 관계없이 같은 응답)" },
    400: errorResponse("VALIDATION_ERROR, INVALID_EMAIL_DOMAIN, CAPTCHA_FAILED"),
    429: errorResponse("RATE_LIMITED"),
  },
});
registry.registerPath({
  method: "post",
  path: "/auth/email/verify",
  tags: ["인증"],
  summary: "인증 코드 확인 (F-04)",
  description:
    "가장 최근에 받은 코드만, 한 번만 확인할 수 있다. 5번 틀리면 코드를 버린다. 성공하면 10분짜리 가입용 토큰.",
  request: { body: json(EmailVerifyRequest) },
  responses: { 200: { description: "확인됨", ...json(EmailVerifyResponse) }, 400: errorResponse("INVALID_CODE") },
});
registry.registerPath({
  method: "post",
  path: "/auth/signup",
  tags: ["인증"],
  summary: "회원가입 (F-04)",
  description: "가입용 토큰은 한 번만 쓸 수 있다. 같은 IP에서 10분에 10번까지.",
  request: { body: json(SignupRequest) },
  responses: {
    201: { description: "가입됨", ...json(AuthResponse) },
    400: errorResponse(
      "VALIDATION_ERROR, INVALID_CODE: 인증 만료·이미 사용(그사이 같은 이메일로 가입된 경우도 같은 응답)",
    ),
    429: errorResponse("RATE_LIMITED"),
  },
});
registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["인증"],
  summary: "분실자 로그인 (F-04)",
  request: { body: json(LoginRequest) },
  responses: { 200: { description: "로그인됨", ...json(AuthResponse) }, 401: errorResponse("UNAUTHORIZED") },
});
registry.registerPath({
  method: "post",
  path: "/auth/demo",
  tags: ["인증"],
  summary: "체험 로그인 (F-05)",
  description:
    "호출할 때마다 새 체험 계정. 24시간 뒤 삭제. 같은 IP에서 10분에 5개까지. 동의(외부 AI 처리)와 캡차(X-Captcha-Token) 필요.",
  request: { body: json(DemoLoginRequest) },
  responses: {
    201: { description: "체험 계정", ...json(AuthResponse) },
    400: errorResponse("VALIDATION_ERROR, CAPTCHA_FAILED"),
    429: errorResponse("RATE_LIMITED"),
  },
});
registry.registerPath({
  method: "get",
  path: "/me",
  tags: ["인증"],
  summary: "내 정보",
  security: bearer,
  responses: { 200: { description: "내 정보", ...json(MeResponse) }, 401: errorResponse("UNAUTHORIZED") },
});
registry.registerPath({
  method: "post",
  path: "/admin/auth/login",
  tags: ["관리자"],
  summary: "관리자 로그인 (F-14)",
  request: { body: json(LoginRequest) },
  responses: { 200: { description: "로그인됨", ...json(AdminAuthResponse) }, 401: errorResponse("UNAUTHORIZED") },
});

export function createAuthRouter() {
  const router = Router();
  const codeLimit = ipRateLimit({
    windowMinutes: 10,
    limit: 10,
    message: "인증 코드 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const codeDailyLimit = ipRateLimit({
    windowMinutes: 24 * 60,
    limit: 50,
    message: "오늘 이 네트워크에서 받을 수 있는 인증 코드를 모두 받았어요. 내일 다시 시도해 주세요.",
  });
  const signupLimit = ipRateLimit({
    windowMinutes: 10,
    limit: 10,
    message: "가입 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const loginLimit = ipRateLimit({
    windowMinutes: 10,
    limit: 20,
    message: "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  const demoLimit = ipRateLimit({
    windowMinutes: 10,
    limit: 5,
    message: "체험 계정을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요.",
  });

  router.post(
    "/auth/email/code",
    codeLimit,
    codeDailyLimit,
    requireCaptcha(),
    validate("body", EmailCodeRequest),
    async (_req, res) => {
      const body: EmailCodeRequest = res.locals.body;
      await auth.sendSignupCode(body.email);
      res.status(204).end();
    },
  );

  router.post("/auth/email/verify", loginLimit, validate("body", EmailVerifyRequest), async (_req, res) => {
    const body: EmailVerifyRequest = res.locals.body;
    const result: EmailVerifyResponse = await auth.verifySignupCode(body.email, body.code);
    res.json(result);
  });

  router.post("/auth/signup", signupLimit, validate("body", SignupRequest), async (_req, res) => {
    const body: SignupRequest = res.locals.body;
    const result: AuthResponse = await auth.signup(body.verificationToken, body.password, body.consent);
    res.status(201).json(result);
  });

  router.post("/auth/login", loginLimit, validate("body", LoginRequest), async (_req, res) => {
    const body: LoginRequest = res.locals.body;
    const result: AuthResponse = await auth.login(body.email, body.password);
    res.json(result);
  });

  router.post("/auth/demo", demoLimit, requireCaptcha(), validate("body", DemoLoginRequest), async (_req, res) => {
    const body: DemoLoginRequest = res.locals.body;
    const result: AuthResponse = await auth.createDemoAccount(body.consent);
    res.status(201).json(result);
  });

  router.get("/me", requireMember(), async (_req, res) => {
    const result: MeResponse = await auth.getMe(getAuth(res).userId);
    res.json(result);
  });

  router.post("/admin/auth/login", loginLimit, validate("body", LoginRequest), async (_req, res) => {
    const body: LoginRequest = res.locals.body;
    const result: AdminAuthResponse = await auth.adminLogin(body.email, body.password);
    res.json(result);
  });

  return router;
}
