import { ERROR_STATUS, type ErrorCode, ErrorResponse } from "@chajeumpyo/shared";
import type { z } from "zod";
import { type SessionScope, sessionStore } from "./auth";
import { API_BASE } from "./env";

/**
 * 백엔드 호출 한 곳. 모든 src/api 훅이 이 함수를 쓴다.
 * - 기본 주소: VITE_API_BASE (lib/env.ts)
 * - 본문: JSON 또는 FormData(multipart). FormData면 Content-Type을 브라우저가 정한다(경계 문자열 때문에)
 * - 토큰: Authorization: Bearer. 토큰은 URL에 절대 넣지 않는다
 * - 오류: 서버의 {error:{code,message,details}}를 ApiError로 바꾼다
 * - 401: 토큰을 보낸 요청이 401이면 그 세션을 지우고 "로그인 만료" 상태로 보낸다(sessionStore.expire)
 */

/** 서버 에러 코드 + 브라우저에서만 생기는 코드 */
export type ClientErrorCode = "NETWORK_ERROR" | "TIMEOUT" | "INVALID_RESPONSE";
export type ApiErrorCode = ErrorCode | ClientErrorCode;

export type ApiErrorDetail = { path: string; message: string };

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** HTTP 상태. 네트워크 오류·시간 초과는 0 */
  readonly status: number;
  readonly details?: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, status: number, details?: ApiErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** 서버가 보낸 에러 코드인지 (네트워크 오류가 아닌지) */
  get isServerError(): boolean {
    return this.code in ERROR_STATUS;
  }

  /** VALIDATION_ERROR의 필드별 문구를 react-hook-form setError에 넣기 쉬운 모양으로 */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) if (!(d.path in out)) out[d.path] = d.message;
    return out;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** 브라우저에서만 생기는 오류의 문구. 서버 코드 문구는 lib/errors.ts의 ERROR_MESSAGES */
export const CLIENT_ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  NETWORK_ERROR: "인터넷 연결을 확인하고 다시 시도해 주세요.",
  TIMEOUT: "응답이 늦어지고 있어요. 잠시 뒤에 다시 시도해 주세요.",
  INVALID_RESPONSE: "서버 응답을 읽지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
};

/** 기본 제한 시간. 사진 AI 분석·일치 판정은 실제 AI가 10초 가까이 걸릴 수 있어 길게 준다 */
export const DEFAULT_TIMEOUT_MS = 15_000;
export const AI_TIMEOUT_MS = 30_000;

/** 캡차 토큰은 multipart에도 쓰도록 헤더로 보낸다 (backend/src/middlewares/captcha.ts) */
export const CAPTCHA_HEADER = "X-Captcha-Token";

export type RequestOptions<S extends z.ZodType | undefined> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON 본문 */
  json?: unknown;
  /** multipart 본문 */
  form?: FormData;
  query?: Record<string, string | number | undefined | null>;
  /** 어느 세션 토큰을 붙일지. none이면 토큰 없이 */
  auth?: SessionScope | "none";
  /** 응답 검증 스키마. 없으면 본문 없음(204)으로 본다 */
  schema?: S;
  captchaToken?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type Result<S> = S extends z.ZodType ? z.output<S> : undefined;

function buildUrl(path: string, query?: RequestOptions<undefined>["query"]): string {
  const base = API_BASE.replace(/\/+$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function combineSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // HTML 오류 페이지 등
  }
  const parsed = ErrorResponse.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(code, message, res.status, details);
  }
  // 모르는 모양이면 상태 코드로 가장 가까운 코드를 고른다
  const byStatus = (Object.entries(ERROR_STATUS) as [ErrorCode, number][]).find(([, s]) => s === res.status)?.[0];
  return new ApiError(byStatus ?? "INTERNAL_ERROR", "잠시 문제가 생겼어요. 다시 시도해 주세요.", res.status);
}

export async function request<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: RequestOptions<S> = {},
): Promise<Result<S>> {
  const { method = options.json !== undefined || options.form ? "POST" : "GET", auth = "none" } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let sentToken: string | null = null;
  if (auth !== "none") {
    const session = sessionStore.get(auth);
    if (!session) {
      sessionStore.expire(auth);
      throw new ApiError("UNAUTHORIZED", "다시 로그인해 주세요.", 401);
    }
    sentToken = session.accessToken;
    headers.Authorization = `Bearer ${sentToken}`;
  }
  if (options.captchaToken) headers[CAPTCHA_HEADER] = options.captchaToken;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      signal: combineSignals(timeoutMs, options.signal),
      credentials: "omit",
    });
  } catch (err) {
    if (options.signal?.aborted) throw err; // 화면이 취소한 요청은 그대로 (TanStack Query가 처리)
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError("TIMEOUT", CLIENT_ERROR_MESSAGES.TIMEOUT, 0);
    }
    throw new ApiError("NETWORK_ERROR", CLIENT_ERROR_MESSAGES.NETWORK_ERROR, 0);
  }

  if (!res.ok) {
    const error = await parseError(res);
    // 토큰을 보냈는데 401이면 세션 만료. (로그인 실패 401은 토큰 없이 보내므로 여기 안 걸린다)
    if (res.status === 401 && auth !== "none" && sentToken) sessionStore.expire(auth, sentToken);
    throw error;
  }

  if (!options.schema || res.status === 204) return undefined as Result<S>;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError("INVALID_RESPONSE", CLIENT_ERROR_MESSAGES.INVALID_RESPONSE, res.status);
  }
  const parsed = options.schema.safeParse(data);
  if (!parsed.success) {
    if (import.meta.env.DEV) console.error(`[api] ${method} ${path} 응답이 계약과 달라요`, parsed.error.issues);
    throw new ApiError("INVALID_RESPONSE", CLIENT_ERROR_MESSAGES.INVALID_RESPONSE, res.status);
  }
  return parsed.data as Result<S>;
}
