import {
  AdminAuthResponse,
  AuthResponse,
  type DemoConsent,
  type EmailCodeRequest,
  type EmailVerifyRequest,
  EmailVerifyResponse,
  type LoginRequest,
  type MemberConsent,
  MeResponse,
} from "@chajeumpyo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Session, type SessionScope, useAuth } from "@/lib/auth";
import { request } from "@/lib/http";
import { qk } from "./keys";

// L-01 로그인, L-02 회원가입 3단계, C-03 체험 시작, A-01 관리자 로그인, C-05 내 정보

const toSession = (r: AuthResponse | AdminAuthResponse): Session => ({
  accessToken: r.accessToken,
  expiresAt: r.expiresAt,
  user: r.user,
  storagePlace: "storagePlace" in r ? r.storagePlace : undefined,
});

/**
 * L-02 ①: 6자리 코드 메일 보내기(서버는 204). 60초 안에 다시 보내면 RATE_LIMITED, 다른 도메인이면 INVALID_EMAIL_DOMAIN.
 * 이미 가입한 이메일도 같은 응답이다(가입 여부를 숨김). 코드는 5분 유효.
 */
export function useRequestEmailCode() {
  return useMutation({
    mutationFn: async (input: EmailCodeRequest & { captchaToken?: string }) => {
      await request("/auth/email/code", { json: { email: input.email }, captchaToken: input.captchaToken });
      return { sent: true as const };
    },
  });
}

/** L-02 ②: 코드 확인 → 가입용 1회 토큰 (10분). 틀리면 INVALID_CODE, 5회 틀리면 코드를 다시 받아야 함 */
export function useVerifyEmailCode() {
  return useMutation({
    mutationFn: (input: EmailVerifyRequest) =>
      request("/auth/email/verify", { json: input, schema: EmailVerifyResponse }),
  });
}

/** L-02 ③: 비밀번호 + 동의 → 가입과 동시에 로그인 */
export function useSignup() {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: (input: { verificationToken: string; password: string; consent: MemberConsent }) =>
      request("/auth/signup", { json: input, schema: AuthResponse }),
    onSuccess: (r) => signIn("member", toSession(r)),
  });
}

/** L-01 */
export function useLogin() {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: (input: LoginRequest) => request("/auth/login", { json: input, schema: AuthResponse }),
    onSuccess: (r) => signIn("member", toSession(r)),
  });
}

/** C-03: 동의 + 캡차 → 체험 계정(24시간). 같은 IP에서 10분에 5번까지 */
export function useDemoLogin() {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: (input: { consent: DemoConsent; captchaToken?: string }) =>
      request("/auth/demo", {
        json: { consent: input.consent },
        captchaToken: input.captchaToken,
        schema: AuthResponse,
      }),
    onSuccess: (r) => signIn("member", toSession(r)),
  });
}

/** A-01: 관리자 세션은 회원 세션과 따로 저장 */
export function useAdminLogin() {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: (input: LoginRequest) => request("/admin/auth/login", { json: input, schema: AdminAuthResponse }),
    onSuccess: (r) => signIn("admin", toSession(r)),
  });
}

/** C-05: 회원(USER·DEMO)만. 관리자 계정은 /me를 쓸 수 없다(FORBIDDEN) */
export function useMe() {
  const { member } = useAuth();
  return useQuery({
    queryKey: qk.me,
    queryFn: ({ signal }) => request("/me", { auth: "member", schema: MeResponse, signal }),
    enabled: !!member,
    staleTime: 5 * 60_000,
  });
}

/**
 * 로그아웃(서버 호출 없음: 토큰은 상태 없이 만료된다). 그 범위 캐시도 비운다.
 * scope를 안 주면 지금 주소가 /admin이면 관리자, 아니면 회원 세션.
 */
export function useLogout() {
  const { signOut } = useAuth();
  return (scope: SessionScope = currentScope()) => signOut(scope);
}

/** 지금 화면이 관리자 화면(/admin…)이면 admin */
export function currentScope(): SessionScope {
  return typeof window !== "undefined" && /^\/admin(\/|$)/.test(window.location.pathname) ? "admin" : "member";
}

/** 화면용 세션 요약 (src/data/types.ts의 Session 모양). scope를 안 주면 currentScope() */
export type SessionView = {
  user: Session["user"] | null;
  isDemo: boolean;
  isAdmin: boolean;
  storagePlace: { id: number; name: string } | null;
};

export function useSession(scope?: SessionScope): SessionView {
  const { member, admin } = useAuth();
  const s = (scope ?? currentScope()) === "admin" ? admin : member;
  return {
    user: s?.user ?? null,
    isDemo: s?.user.role === "DEMO",
    isAdmin: s?.user.role === "ADMIN",
    storagePlace: s?.storagePlace ?? null,
  };
}
