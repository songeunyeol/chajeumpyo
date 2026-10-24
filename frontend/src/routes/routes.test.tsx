import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import type { Session } from "@/data";
import { setMockSession } from "@/data/mock/hooks";
import { routes } from "./index";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const MEMBER: Session = {
  user: { id: "u", email: "a@skuniv.ac.kr", role: "USER" },
  isDemo: false,
  isAdmin: false,
  storagePlace: null,
};
const ADMIN: Session = { ...MEMBER, isAdmin: true, user: { id: "a", email: "admin@skuniv.ac.kr", role: "ADMIN" } };
const R = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F = "11111111-1111-4111-8111-111111111111";

// [경로, 화면 ID, 필요한 세션]
const cases: [string, RegExp, "none" | "member" | "admin"][] = [
  ["/", /잃어버렸어요/, "none"],
  ["/demo", /이렇게 체험해요/, "none"],
  ["/status/offline", /C-06/, "none"],
  ["/map", /C-07/, "none"],
  ["/found/new", /물건 사진을 올려 주세요/, "none"],
  ["/found/new/details", /물건 사진을 올려 주세요/, "none"], // 사진 없으면 F-01로
  ["/found/new/uploading", /물건 사진을 올려 주세요/, "none"],
  ["/found/new/result", /물건 사진을 올려 주세요/, "none"],
  ["/login", /L-01/, "none"],
  ["/signup", /L-02/, "none"],
  ["/home", /L-03/, "member"],
  ["/reports/new", /L-04/, "member"],
  [`/reports/${R}`, /L-05/, "member"],
  [`/reports/${R}/edit`, /L-06/, "member"],
  [`/reports/${R}/claim/${F}`, /L-07/, "member"],
  ["/claims/at-1/question", /L-09/, "member"],
  [`/items/${F}`, /L-10/, "member"],
  [`/items/${F}/qr`, /L-11/, "member"],
  [`/items/${F}/done`, /L-12/, "member"],
  ["/notifications", /C-04/, "member"],
  ["/me", /C-05/, "member"],
  ["/admin/login", /A-01/, "none"],
  ["/admin", /A-02/, "admin"],
  ["/admin/items", /A-03/, "admin"],
  [`/admin/items/${F}`, /A-04/, "admin"],
  ["/admin/scan", /A-05/, "admin"],
  ["/admin/hotspots", /A-06/, "admin"],
  ["/no-such-page", /C-06/, "none"],
];

describe("라우트: 모든 화면 ID에 경로가 있다", () => {
  it.each(cases)("%s → %s", async (path, id, who) => {
    setMockSession(who === "member" ? MEMBER : who === "admin" ? ADMIN : null);
    renderAt(path);
    expect((await screen.findAllByText(id))[0]).toBeInTheDocument();
  });
});

describe("가드", () => {
  it("로그인 안 한 분실자 화면은 L-01로 보낸다", async () => {
    setMockSession(null);
    renderAt("/home");
    expect(await screen.findByText(/L-01/)).toBeInTheDocument();
  });
  it("관리자 화면은 A-01로 보낸다", async () => {
    setMockSession(MEMBER);
    renderAt("/admin/items");
    expect(await screen.findByText(/A-01/)).toBeInTheDocument();
  });
});
