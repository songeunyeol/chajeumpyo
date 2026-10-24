import { z } from "zod";
import { sessionStore } from "./auth";
import { ApiError, request } from "./http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn<typeof fetch>();
/** n번째 fetch 호출의 헤더 */
const headersOf = (n = 0) => (fetchMock.mock.calls[n]?.[1]?.headers ?? {}) as Record<string, string>;
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStore.set("member", null);
  sessionStore.set("admin", null);
});
afterEach(() => vi.unstubAllGlobals());

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const login = (scope: "member" | "admin", token = "tok-1", role: "USER" | "DEMO" | "ADMIN" = "USER") =>
  sessionStore.set(scope, {
    accessToken: token,
    expiresAt: future(),
    user: { id: "u", email: "a@skuniv.ac.kr", role },
  });

describe("request", () => {
  it("서버 오류 본문을 ApiError(code·status·details)로 바꾼다", async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: { code: "VALIDATION_ERROR", message: "확인해 주세요.", details: [{ path: "email", message: "형식" }] },
      }),
    );
    const err = await request("/x", { json: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "VALIDATION_ERROR", status: 400, message: "확인해 주세요." });
    expect((err as ApiError).fieldErrors()).toEqual({ email: "형식" });
    expect((err as ApiError).isServerError).toBe(true);
  });

  it("모르는 오류 본문은 상태 코드로 가장 가까운 코드를 고른다", async () => {
    fetchMock.mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(request("/x")).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 502 });
  });

  it("네트워크 오류는 NETWORK_ERROR(status 0)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(request("/x")).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });

  it("시간 초과는 TIMEOUT", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(request("/x")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("응답이 스키마와 다르면 INVALID_RESPONSE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(json(200, { id: 1 }));
    await expect(request("/x", { schema: z.object({ id: z.string() }) })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("204는 undefined", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request("/x", { method: "PATCH", auth: "none" })).resolves.toBeUndefined();
  });

  it("토큰은 Authorization 헤더로만 보내고 URL에는 넣지 않는다", async () => {
    login("member", "secret-token");
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await request("/me", { auth: "member", schema: z.object({ ok: z.boolean() }), query: { page: 2 } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("secret-token");
    expect(String(url)).toMatch(/\/me\?page=2$/);
    expect(headersOf().Authorization).toBe("Bearer secret-token");
    expect(init?.credentials).toBe("omit");
  });

  it("관리자 요청은 관리자 토큰을 쓴다", async () => {
    login("member", "member-token");
    login("admin", "admin-token", "ADMIN");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await request("/admin/x", { method: "POST", auth: "admin" });
    expect(headersOf().Authorization).toBe("Bearer admin-token");
  });

  it("FormData면 Content-Type을 직접 넣지 않는다(경계 문자열은 브라우저가)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const form = new FormData();
    form.append("a", "1");
    await request("/found-items", { form, captchaToken: "cap" });
    const headers = headersOf();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["X-Captcha-Token"]).toBe("cap");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("토큰을 보낸 요청이 401이면 그 세션만 지우고 만료를 알린다", async () => {
    login("member", "old", "DEMO");
    login("admin", "admin-token", "ADMIN");
    const expired = vi.fn();
    const off = sessionStore.onExpired(expired);
    fetchMock.mockResolvedValue(json(401, { error: { code: "UNAUTHORIZED", message: "체험 시간이 끝났어요." } }));
    await expect(request("/me", { auth: "member" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(sessionStore.get("member")).toBeNull();
    expect(sessionStore.get("admin")).not.toBeNull();
    expect(expired).toHaveBeenCalledWith({ scope: "member", demo: true });
    off();
  });

  it("로그인 실패 401(토큰 없음)은 세션을 건드리지 않는다", async () => {
    login("member", "keep");
    const expired = vi.fn();
    const off = sessionStore.onExpired(expired);
    fetchMock.mockResolvedValue(json(401, { error: { code: "UNAUTHORIZED", message: "맞지 않아요." } }));
    await expect(request("/admin/auth/login", { json: {} })).rejects.toMatchObject({ status: 401 });
    expect(sessionStore.get("member")?.accessToken).toBe("keep");
    expect(expired).not.toHaveBeenCalled();
    off();
  });

  it("늦게 온 옛 토큰의 401은 새 세션을 지우지 않는다", async () => {
    login("member", "old");
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = request("/me", { auth: "member" }).catch(() => null);
    login("member", "new");
    resolve(json(401, { error: { code: "UNAUTHORIZED", message: "x" } }));
    await pending;
    expect(sessionStore.get("member")?.accessToken).toBe("new");
  });

  it("세션 없이 인증 요청을 하면 보내지 않고 UNAUTHORIZED", async () => {
    await expect(request("/me", { auth: "member" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
