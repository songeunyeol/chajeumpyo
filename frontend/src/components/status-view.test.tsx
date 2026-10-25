import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setMockSession } from "@/data/mock/hooks";
import { routes } from "@/routes";
import { OfflineToast, StatusView, statusKindOf } from "./status-view";

function renderAt(path: string) {
  setMockSession(null);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.useRealTimers());

describe("C-06 상태 화면", () => {
  it("오류 → 상태 종류", () => {
    expect(statusKindOf({ code: "NETWORK_ERROR", status: 0 })).toBe("offline");
    expect(statusKindOf({ code: "TIMEOUT", status: 0 })).toBe("offline");
    expect(statusKindOf({ code: "NOT_FOUND", status: 404 })).toBe("notfound");
    expect(statusKindOf({ code: "RATE_LIMITED", status: 429 })).toBe("ratelimit");
    expect(statusKindOf({ code: "INTERNAL_ERROR", status: 500 })).toBe("server");
    expect(statusKindOf({ code: "INTERNAL_ERROR", status: 502 })).toBe("server");
    expect(statusKindOf({ code: "VALIDATION_ERROR", status: 400 })).toBeNull();
  });

  it("429: 카운트다운이 끝나야 [다시 시도하기]가 켜진다", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(
      <MemoryRouter>
        <StatusView kind="ratelimit" retryAfter={42} onRetry={retry} />
      </MemoryRouter>,
    );
    expect(screen.getByText("0:42 뒤에 다시 할 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도하기" })).toBeDisabled();
    act(() => vi.advanceTimersByTime(43_000));
    expect(screen.queryByText(/뒤에 다시 할 수 있어요/)).toBeNull();
    expect(screen.getByRole("button", { name: "다시 시도하기" })).toBeEnabled();
  });

  it("500: 다시 시도하기와 처음으로", () => {
    render(
      <MemoryRouter>
        <StatusView kind="server" onRetry={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "문제가 생겼어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도하기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "처음으로" })).toHaveAttribute("href", "/");
  });

  it("없는 주소는 404", async () => {
    renderAt("/no-such-page");
    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });

  it("로그인 만료면 L-01 위에 시트, 체험이면 [체험 다시 시작하기]", async () => {
    renderAt("/login?expired=1");
    expect(await screen.findByRole("dialog", { name: "다시 로그인해 주세요" })).toBeInTheDocument();
  });

  it("체험 만료", async () => {
    renderAt("/login?expired=demo");
    expect(await screen.findByRole("button", { name: "체험 다시 시작하기" })).toBeInTheDocument();
  });

  it("오프라인이면 토스트, 다시 연결되면 닫힘", async () => {
    render(
      <>
        <Toaster />
        <OfflineToast />
      </>,
    );
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText("오프라인이에요. 연결되면 자동으로 다시 시도해요.")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await vi.waitFor(() => expect(screen.queryByText(/오프라인이에요/)).toBeNull());
  });
});
