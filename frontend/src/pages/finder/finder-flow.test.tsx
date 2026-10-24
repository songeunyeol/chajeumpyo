import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { routes } from "@/routes";
import { checkPhoto } from "./flow-context";
import { progressAt } from "./uploading-page";

const consent = JSON.stringify({ version: "2026-10-12", email: false, externalAi: true, location: false });

function start() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: ["/found/new"] });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const png = (name: string, size = 1000) => new File([new Uint8Array(size)], name, { type: "image/png" });

async function fillDetails(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(screen.getByTestId("album-input"), file);
  await user.click(screen.getByRole("button", { name: /다음/ }));
  // 사진 위치도, 위치 동의도 없으니 건물 시트가 열린다
  await screen.findByText("어느 건물에서 주웠나요?");
  await user.click(screen.getByRole("radio", { name: "혜인관" }));
  await user.click(screen.getByRole("button", { name: "혜인관으로 할게요" }));
  await user.click(screen.getByRole("button", { name: "지하 1층" }));
  await user.click(screen.getByRole("radio", { name: /그 자리에 둠/ }));
  await user.click(screen.getByRole("checkbox", { name: /사람인지/ }));
}

describe("F-01~F-04 습득물 등록 흐름", () => {
  beforeEach(() => {
    localStorage.setItem("chajeumpyo.consent.finder", consent);
    URL.createObjectURL = () => "blob:preview";
    URL.revokeObjectURL = () => {};
  });

  it("사진 형식·용량은 올리기 전에 검사한다", () => {
    expect(checkPhoto(png("a.png"))).toBeNull();
    expect(checkPhoto(new File(["x"], "a.heic", { type: "" }))).toBeNull();
    expect(checkPhoto(new File(["x"], "a.gif", { type: "image/gif" }))).toBe("type");
    expect(checkPhoto(png("big.png", 10 * 1024 * 1024 + 1))).toBe("size");
  });

  it("진행 막대는 10초에 90%까지만 간다", () => {
    expect(progressAt(0)).toBe(0);
    expect(progressAt(5000)).toBe(45);
    expect(progressAt(30_000)).toBe(90);
  });

  it("처음이면 동의 시트가 먼저 열린다", async () => {
    localStorage.clear();
    start();
    expect(await screen.findByText("시작하기 전에 확인해 주세요")).toBeInTheDocument();
  });

  it("용량이 큰 사진은 F-01에서 바로 안내한다", async () => {
    const user = userEvent.setup();
    start();
    await user.upload(screen.getByTestId("album-input"), png("big.png", 11 * 1024 * 1024));
    expect(await screen.findByText(/10MB 이하 사진으로/)).toBeInTheDocument();
  });

  it("찍기 → 다음 → 등록하기 → 등록 결과(검토 대기)", async () => {
    const user = userEvent.setup();
    const router = start();
    await fillDetails(user, png("review.png"));
    await user.click(screen.getByRole("button", { name: "등록하기" }));
    expect(await screen.findByText("물건을 알아보고 있어요")).toBeInTheDocument();
    expect(await screen.findByText("접수됐어요", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/found/new/result");
    expect(screen.getByText("혜인관 지하 1층")).toBeInTheDocument();
  }, 10_000);

  it("물건이 안 보이면(422) 다시 찍어도 건물·보관 입력이 남는다", async () => {
    const user = userEvent.setup();
    start();
    await fillDetails(user, png("blank.png"));
    await user.click(screen.getByRole("button", { name: "등록하기" }));
    expect(await screen.findByText("사진에서 물건을 찾지 못했어요", {}, { timeout: 6000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /다시 찍기/ }));
    await user.upload(screen.getByTestId("album-input"), png("photo.png"));
    await user.click(screen.getByRole("button", { name: /다음/ }));
    await waitFor(() => expect(screen.getByText("혜인관")).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: /그 자리에 둠/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "지하 1층" })).toHaveAttribute("aria-pressed", "true");
  }, 10_000);
});
