import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";
import type { Session } from "@/data";
import * as db from "@/data/mock/db";
import { setMockSession } from "@/data/mock/hooks";
import { routes } from "@/routes";
import { buildUpdate, formFromDetail } from "./attribute-form";
import { HourBars } from "./hotspots-page";
import { showInPersonBlock } from "./item-detail-page";
import { normalizeToken } from "./scan-page";

const ADMIN: Session = {
  user: { id: "a", email: "center@skuniv.ac.kr", role: "ADMIN" },
  isDemo: false,
  isAdmin: true,
  storagePlace: { id: 1, name: "학생지원센터" },
};
const F_PLAIN = "11111111-1111-4111-8111-111111111111";
const F_INPERSON = "33333333-3333-4333-8333-333333333333";
const F_CLAIMED = "44444444-4444-4444-8444-444444444444";
const F_REVIEW = "66666666-6666-4666-8666-666666666666";
const SLOW = { timeout: 5000 };

function renderAt(path: string) {
  setMockSession(ADMIN);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

describe("A-03 습득물 목록", { timeout: 15000 }, () => {
  it("원본 사진을 쓰지 않고 listImageUrl만, 없으면 빈 상자", async () => {
    renderAt("/admin/items");
    const thumbs = await screen.findAllByTestId("list-thumb", {}, SLOW);
    const originals = new Set(Object.keys(db.foundItems).map((id) => db.adminDetail(id).originalImageUrl));
    const publics = new Set(Object.keys(db.foundItems).map((id) => db.adminDetail(id).publicImageUrl));
    for (const t of thumbs) {
      const src = t.getAttribute("src") ?? "";
      expect(originals.has(src)).toBe(false);
      expect(publics.has(src)).toBe(true);
    }
    // 수령된 물건(listImageUrl null)은 빈 상자
    expect(screen.getAllByTestId("list-thumb-empty").length).toBeGreaterThan(0);
    for (const img of document.querySelectorAll("img")) {
      expect(originals.has(img.getAttribute("src") ?? "")).toBe(false);
    }
  });

  it("상태 칩에 건수, 대면 확인만·시드 표시", async () => {
    renderAt("/admin/items");
    await screen.findAllByTestId("list-thumb", {}, SLOW);
    expect(screen.getByRole("button", { name: /검토 대기\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /수령 완료\s*1/ })).toBeInTheDocument();
    expect(screen.getAllByText("대면 확인만").length).toBeGreaterThan(0);
    expect(screen.getAllByText("시드").length).toBeGreaterThan(0);
  });
});

describe("A-04 습득물 상세", { timeout: 15000 }, () => {
  it("대면 확인 블록 조건: 잠김 + 등록됨/열람됨일 때만", () => {
    const t = "2026-10-20T00:00:00.000Z";
    expect(showInPersonBlock({ claimLockedAt: t, status: "REGISTERED" })).toBe(true);
    expect(showInPersonBlock({ claimLockedAt: t, status: "REVEALED" })).toBe(true);
    expect(showInPersonBlock({ claimLockedAt: t, status: "CLAIMED" })).toBe(false);
    expect(showInPersonBlock({ claimLockedAt: t, status: "REVIEW" })).toBe(false);
    expect(showInPersonBlock({ claimLockedAt: t, status: "EXPIRED" })).toBe(false);
    expect(showInPersonBlock({ claimLockedAt: null, status: "REGISTERED" })).toBe(false);
  });

  it("잠긴 물건: 메모 1~200자, 글자 수, 신분증 안내", async () => {
    const user = userEvent.setup();
    renderAt(`/admin/items/${F_INPERSON}`);
    const block = await screen.findByRole("region", { name: "대면 확인 후 수령" }, SLOW);
    expect(within(block).getByText(/신분증 번호 전체는 적지 마세요/)).toBeInTheDocument();
    const memo = within(block).getByLabelText("신분 확인 메모");
    expect(memo).toHaveAttribute("maxLength", "200");
    expect(within(block).getByText("0 / 200")).toBeInTheDocument();
    await user.click(within(block).getByRole("button", { name: "대면 확인 후 수령 완료" }));
    expect(within(block).getByRole("alert")).toHaveTextContent("확인한 내용을 적어 주세요.");
    await user.type(memo, "학생증 확인");
    expect(within(block).getByText("6 / 200")).toBeInTheDocument();
  });

  it("잠기지 않은 물건엔 대면 확인 블록이 없다", async () => {
    renderAt(`/admin/items/${F_PLAIN}`);
    await screen.findByRole("button", { name: "속성 고치기" }, SLOW);
    expect(screen.queryByRole("region", { name: "대면 확인 후 수령" })).toBeNull();
  });

  it("수령 완료 물건엔 대면 확인 블록이 없다(잠김+수령 완료 조합은 위 조건 테스트)", async () => {
    renderAt(`/admin/items/${F_CLAIMED}`);
    // 수령 완료면 속성 고치기 대신 안내
    await screen.findByText("수령·만료로 정보가 지워졌어요", {}, SLOW);
    expect(screen.queryByRole("button", { name: "속성 고치기" })).toBeNull();
    expect(screen.queryByRole("region", { name: "대면 확인 후 수령" })).toBeNull();
  });

  it("검토 대기는 [저장하고 등록], 빈 필수 칸은 막는다", async () => {
    const user = userEvent.setup();
    renderAt(`/admin/items/${F_REVIEW}`);
    const btn = await screen.findByRole("button", { name: "저장하고 등록" }, SLOW);
    await user.click(btn);
    expect(await screen.findByText("종류를 골라 주세요.")).toBeInTheDocument();
    expect(screen.getByText("제목을 적어 주세요.")).toBeInTheDocument();
  });

  it("폼 → AdminUpdateFoundItemRequest로 검사", () => {
    const f = formFromDetail(db.adminDetail(F_PLAIN));
    const ok = buildUpdate(f, false);
    expect(ok.ok).toBe(true);
    const reg = buildUpdate(f, true);
    expect(reg.ok && reg.data.status).toBe("REGISTERED");
    const bad = buildUpdate({ ...f, features: [{ key: "sticker", value: "" }] }, false);
    expect(bad.ok).toBe(false);
    const same = buildUpdate({ ...f, categoryAlt: f.category }, false);
    expect(same.ok).toBe(false);
  });
});

describe("A-05 QR 스캔", { timeout: 15000 }, () => {
  it("직접 입력은 공백만 지운다", () => {
    expect(normalizeToken("  AbC-1 2_x \n")).toBe("AbC-12_x");
  });

  it.each([
    ["expired", "QR이 만료됐어요"],
    ["claimed", "이미 수령된 물건이에요"],
    ["other", "다른 보관처의 물건이에요"],
  ])("코드 %s → %s", async (code, title) => {
    const user = userEvent.setup();
    renderAt("/admin/scan");
    // jsdom엔 카메라가 없어 바로 직접 입력 창이 열린다
    expect(await screen.findByText("카메라를 쓸 수 없어요", {}, SLOW)).toBeInTheDocument();
    await user.type(await screen.findByLabelText("수령 코드"), `tok ${code}`);
    await user.click(screen.getByRole("button", { name: "확인" }));
    expect(await screen.findByText(title, {}, SLOW)).toBeInTheDocument();
  });
});

describe("A-06 분실 다발 카드", { timeout: 15000 }, () => {
  it("시드 집계 표시, 한 줄 요약, 표로 보기", async () => {
    const user = userEvent.setup();
    renderAt("/admin/hotspots");
    expect(await screen.findByText("시드 집계", {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText(db.hotspots.topInsight)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "표로 보기" }));
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(3);
    expect(within(tables[0] as HTMLElement).getByRole("cell", { name: "유담관" })).toBeInTheDocument();
    expect(within(tables[0] as HTMLElement).getByRole("cell", { name: "41" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "막대로 보기" }));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("직접 기간은 1년 이내", async () => {
    const user = userEvent.setup();
    renderAt("/admin/hotspots");
    await screen.findByText("시드 집계", {}, SLOW);
    await user.click(screen.getByRole("button", { name: "직접" }));
    const from = await screen.findByLabelText("시작 날짜");
    await user.clear(from);
    await user.type(from, "2024-01-01");
    await user.click(screen.getByRole("button", { name: "이 기간으로 보기" }));
    expect(await screen.findByText("기간은 1년 이내로 골라 주세요.")).toBeInTheDocument();
  });

  it("시간대 막대: 8~20시 밖에 신고가 있으면 0~23시 전부", () => {
    const { unmount } = render(<HourBars rows={[{ hour: 13, count: 3 }]} />);
    expect(screen.getByText("(8~20시)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1시 0건" })).toBeNull();
    unmount();
    render(
      <HourBars
        rows={[
          { hour: 1, count: 5 },
          { hour: 13, count: 2 },
        ]}
      />,
    );
    expect(screen.getByText("(0~23시)")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(24);
  });
});
