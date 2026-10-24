import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, maskEmail, sessionStore, useAuth } from "./auth";

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const session = (token: string, role: "USER" | "DEMO" | "ADMIN" = "USER") => ({
  accessToken: token,
  expiresAt: future(),
  user: { id: "u", email: "kim@skuniv.ac.kr", role },
});

beforeEach(() => {
  sessionStore.set("member", null);
  sessionStore.set("admin", null);
});

describe("sessionStore", () => {
  it("localStorage에 회원·관리자를 따로 저장한다", () => {
    sessionStore.set("member", session("m"));
    sessionStore.set("admin", session("a", "ADMIN"));
    expect(JSON.parse(localStorage.getItem("chajeumpyo.session.member") ?? "{}").accessToken).toBe("m");
    expect(JSON.parse(localStorage.getItem("chajeumpyo.session.admin") ?? "{}").accessToken).toBe("a");
    sessionStore.set("member", null);
    expect(localStorage.getItem("chajeumpyo.session.member")).toBeNull();
    expect(sessionStore.get("admin")?.accessToken).toBe("a");
  });

  it("만료 시각이 지난 세션은 get이 null", () => {
    sessionStore.set("member", { ...session("m"), expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(sessionStore.get("member")).toBeNull();
  });

  it("localStorage가 막혀도 메모리 세션으로 동작한다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => sessionStore.set("member", session("m"))).not.toThrow();
    expect(sessionStore.get("member")?.accessToken).toBe("m");
    spy.mockRestore();
  });

  it("다른 탭의 변경(storage 이벤트)을 따라간다", () => {
    localStorage.setItem("chajeumpyo.session.member", JSON.stringify(session("other-tab")));
    sessionStore.reloadFromStorage();
    expect(sessionStore.get("member")?.accessToken).toBe("other-tab");
  });
});

describe("AuthProvider", () => {
  it("signIn/signOut이 화면 상태와 onSessionChange를 바꾼다", () => {
    const onSessionChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider onSessionChange={onSessionChange} onExpired={() => {}}>
        {children}
      </AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.member).toBeNull();
    act(() => result.current.signIn("member", session("d", "DEMO")));
    expect(result.current.isDemo).toBe(true);
    expect(onSessionChange).toHaveBeenCalledWith("member");
    act(() => result.current.signOut("member"));
    expect(result.current.member).toBeNull();
  });

  it("만료되면 onExpired를 부른다", () => {
    const onExpired = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider onExpired={onExpired}>{children}</AuthProvider>
    );
    renderHook(() => useAuth(), { wrapper });
    act(() => sessionStore.set("admin", session("a", "ADMIN")));
    act(() => sessionStore.expire("admin"));
    expect(onExpired).toHaveBeenCalledWith({ scope: "admin", demo: false });
  });
});

it("maskEmail", () => {
  expect(maskEmail("kimstudent@skuniv.ac.kr")).toBe("ki********@skuniv.ac.kr");
  expect(maskEmail("ab@skuniv.ac.kr")).toBe("a*@skuniv.ac.kr");
});
