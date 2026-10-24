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
  ["/login", /학교 이메일/, "none"],
  ["/signup", /회원가입/, "none"],
  ["/home", /분실 신고하기|잃어버린 물건/, "member"],
  ["/reports/new", /분실 신고/, "member"],
  [`/reports/${R}`, /후보 확인/, "member"],
  [`/reports/${R}/edit`, /신고 상세/, "member"],
  [`/reports/${R}/claim/${F}`, /설명과 물건을 비교하고 있어요/, "member"],
  ["/claims/at-1/question", /확인 질문/, "member"],
  [`/items/${F}`, /내 물건/, "member"],
  [`/items/${F}/qr`, /수령 QR/, "member"],
  [`/items/${F}/done`, /물건을 찾았어요/, "member"],
  ["/notifications", /알림/, "member"],
  ["/me", /내 정보/, "member"],
  ["/admin/login", /보관처 직원 로그인/, "none"],
  ["/admin", /습득물 현황/, "admin"],
  ["/admin/items", /이전 페이지|전체/, "admin"],
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
    expect((await screen.findAllByText(/학교 이메일/))[0]).toBeInTheDocument();
  });
  it("관리자 화면은 A-01로 보낸다", async () => {
    setMockSession(MEMBER);
    renderAt("/admin/items");
    expect(await screen.findByText(/보관처 직원 로그인/)).toBeInTheDocument();
  });
});
