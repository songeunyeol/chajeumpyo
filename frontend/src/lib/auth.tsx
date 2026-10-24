import type { Role } from "@chajeumpyo/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

/**
 * 로그인 세션. 회원(USER·DEMO)과 관리자(ADMIN)를 따로 둔다: 같은 기기에서 관리자 화면과 분실자 화면을 오가도 섞이지 않게.
 * localStorage에 남기되(새로고침 유지) 읽고 쓰기는 모두 try/catch로 감싼다(사생활 보호 모드 등에서 막힐 수 있다).
 * 토큰은 URL·쿼리에 넣지 않는다. Authorization 헤더로만 보낸다(lib/http.ts).
 */

export type SessionScope = "member" | "admin";

export type Session = {
  accessToken: string;
  /** ISO 시각. 지나면 세션을 버린다 */
  expiresAt: string;
  user: { id: string; email: string; role: Role };
  /** 관리자 소속 보관처 */
  storagePlace?: { id: number; name: string } | null;
};

/** 만료 사유. 화면 C-06 "로그인 만료"가 이 값으로 문구를 고른다 */
export type ExpiredReason = { scope: SessionScope; demo: boolean };

const STORAGE_KEY: Record<SessionScope, string> = {
  member: "chajeumpyo.session.member",
  admin: "chajeumpyo.session.admin",
};

/** 로그인 화면 경로. 만료되면 `?expired=1`(체험은 `?expired=demo`)을 붙여 보낸다 */
export const LOGIN_PATH: Record<SessionScope, string> = { member: "/login", admin: "/admin/login" };

function read(scope: SessionScope): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY[scope]);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (typeof s?.accessToken !== "string" || typeof s.expiresAt !== "string" || !s.user) return null;
    return s;
  } catch {
    return null;
  }
}

function write(scope: SessionScope, s: Session | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY[scope], JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY[scope]);
  } catch {
    // 저장이 막혀도 메모리 세션으로 계속 쓴다
  }
}

const isLive = (s: Session | null): s is Session => !!s && Date.parse(s.expiresAt) > Date.now();

type Listener = () => void;
type ExpiredListener = (reason: ExpiredReason) => void;

/** React 밖(lib/http.ts)에서도 쓰는 세션 저장소 */
function createSessionStore() {
  const current: Record<SessionScope, Session | null> = {
    member: read("member"),
    admin: read("admin"),
  };
  const listeners = new Set<Listener>();
  const expiredListeners = new Set<ExpiredListener>();
  const emit = () => {
    for (const l of listeners) l();
  };

  return {
    /** 살아 있는 세션만. 만료됐으면 null */
    get(scope: SessionScope): Session | null {
      const s = current[scope];
      return isLive(s) ? s : null;
    },
    /** 렌더용 스냅샷 (만료 여부와 관계없이 같은 객체를 돌려줘야 useSyncExternalStore가 안정적) */
    snapshot(scope: SessionScope): Session | null {
      return current[scope];
    },
    set(scope: SessionScope, s: Session | null) {
      current[scope] = s;
      write(scope, s);
      emit();
    },
    /**
     * 401을 받았거나 만료됐을 때. token을 주면 그 토큰일 때만 지운다
     * (늦게 도착한 옛 요청의 401이 방금 새로 로그인한 세션을 지우지 않게).
     */
    expire(scope: SessionScope, token?: string) {
      const s = current[scope];
      if (token && s && s.accessToken !== token) return;
      const demo = s?.user.role === "DEMO";
      const had = !!s;
      current[scope] = null;
      write(scope, null);
      emit();
      if (had) for (const l of expiredListeners) l({ scope, demo });
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    onExpired(l: ExpiredListener) {
      expiredListeners.add(l);
      return () => {
        expiredListeners.delete(l);
      };
    },
    /** 다른 탭에서 로그인·로그아웃하면 따라간다 */
    reloadFromStorage() {
      current.member = read("member");
      current.admin = read("admin");
      emit();
    },
  };
}

export const sessionStore = createSessionStore();

export function useSessionValue(scope: SessionScope): Session | null {
  const s = useSyncExternalStore(
    sessionStore.subscribe,
    () => sessionStore.snapshot(scope),
    () => null,
  );
  return isLive(s) ? s : null;
}

type AuthContextValue = {
  member: Session | null;
  admin: Session | null;
  /** 체험 계정이면 true (상단 "체험 모드" 띠) */
  isDemo: boolean;
  signIn: (scope: SessionScope, s: Session) => void;
  signOut: (scope: SessionScope) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function defaultOnExpired({ scope, demo }: ExpiredReason) {
  const target = `${LOGIN_PATH[scope]}?expired=${demo ? "demo" : "1"}`;
  if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH[scope]) {
    window.location.assign(target);
  }
}

/**
 * 앱 최상단에 한 번. onExpired로 라우터 이동을 넘기면(useNavigate) 새로고침 없이 이동한다.
 * onSignOut: 세션이 바뀔 때 캐시를 비우는 데 쓴다 (api/provider.tsx가 연결)
 */
export function AuthProvider({
  children,
  onExpired = defaultOnExpired,
  onSessionChange,
}: {
  children: ReactNode;
  onExpired?: (reason: ExpiredReason) => void;
  onSessionChange?: (scope: SessionScope) => void;
}) {
  const member = useSessionValue("member");
  const admin = useSessionValue("admin");

  useEffect(() => sessionStore.onExpired(onExpired), [onExpired]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY.member || e.key === STORAGE_KEY.admin) sessionStore.reloadFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 만료 시각이 되면 세션을 버린다 (체험 24시간 등)
  useEffect(() => {
    const timers = (["member", "admin"] as const).flatMap((scope) => {
      const s = scope === "member" ? member : admin;
      if (!s) return [];
      const ms = Date.parse(s.expiresAt) - Date.now();
      // setTimeout 최대치(약 24.8일)를 넘으면 걸지 않는다
      if (ms > 2 ** 31 - 1) return [];
      return [window.setTimeout(() => sessionStore.expire(scope, s.accessToken), Math.max(0, ms))];
    });
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [member, admin]);

  const signIn = useCallback(
    (scope: SessionScope, s: Session) => {
      sessionStore.set(scope, s);
      onSessionChange?.(scope);
    },
    [onSessionChange],
  );
  const signOut = useCallback(
    (scope: SessionScope) => {
      sessionStore.set(scope, null);
      onSessionChange?.(scope);
    },
    [onSessionChange],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ member, admin, isDemo: member?.user.role === "DEMO", signIn, signOut }),
    [member, admin, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 <ApiProvider>(또는 <AuthProvider>) 안에서 써야 해요.");
  return ctx;
}

/** 이메일 가리기: abcd@skuniv.ac.kr → ab**@skuniv.ac.kr (C-05) */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const keep = Math.min(2, Math.max(1, local.length - 1));
  return `${local.slice(0, keep)}${"*".repeat(Math.max(1, local.length - keep))}${email.slice(at)}`;
}
