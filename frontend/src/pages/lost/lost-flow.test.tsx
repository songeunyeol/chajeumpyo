import { COLOR_LABELS, FEATURE_KEY_LABELS } from "@chajeumpyo/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, type InitialEntry, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { THUMB_FILTER } from "@/components/candidate-card";
import type { Session } from "@/data";
import { setMockSession } from "@/data/mock/hooks";
import { groupToken } from "@/lib/josa";
import { routes } from "@/routes";

const MEMBER: Session = {
  user: { id: "u", email: "a@skuniv.ac.kr", role: "USER" },
  isDemo: false,
  isAdmin: false,
  storagePlace: null,
};
const RA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const F_PASS = "11111111-1111-4111-8111-111111111111";
const F_QUESTION = "22222222-2222-4222-8222-222222222222";
const F_INPERSON = "33333333-3333-4333-8333-333333333333";
const F_FAIL = "44444444-4444-4444-8444-444444444444";
const F_LOCKED = "55555555-5555-4555-8555-555555555555";
const JUDGE = { timeout: 5000 };

function renderAt(entry: InitialEntry, session: Session | null = MEMBER) {
  setMockSession(session);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

/** 특징·색·브랜드 이름이 하나라도 보이면 그 이름 */
function leakedLabel(text: string): string | undefined {
  const labels = [
    ...Object.values(FEATURE_KEY_LABELS),
    ...Object.values(COLOR_LABELS),
    // 브랜드는 자유 입력이라 가짜 데이터에 쓰인 이름과 흔한 이름으로 본다
    "애플",
    "삼성",
    "Apple",
    "Samsung",
  ];
  return labels.find((l) => l.length > 1 && text.includes(l));
}

describe("L-05 후보 목록", () => {
  it("카드에 색·브랜드·특징·점수·순위가 없고 썸네일은 강하게 흐리다", async () => {
    renderAt(`/reports/${RA}`);
    const cards = await screen.findAllByRole("article");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(3);
    for (const card of cards) {
      const text = card.textContent ?? "";
      expect(leakedLabel(text)).toBeUndefined();
      expect(text).not.toMatch(/점수|순위|score|rank|%|색|브랜드|특징/i);
    }
    const thumbs = screen.getAllByTestId("candidate-thumb");
    expect(THUMB_FILTER).toBe("blur(14px) grayscale(1)");
    for (const t of thumbs) {
      const img = t.tagName === "IMG" ? t : t.querySelector("img");
      expect((img as HTMLElement).style.filter).toBe(THUMB_FILTER);
    }
  });
});

describe("L-07 → L-08 판정", () => {
  it("판정 중 화면 다음 통과 → 사진과 위치 보기", async () => {
    renderAt(`/reports/${RA}/claim/${F_PASS}`);
    expect(screen.getByText("설명과 물건을 비교하고 있어요")).toBeInTheDocument();
    expect(await screen.findByText("내 물건이 맞아요", {}, JUDGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /사진과 위치 보기/ })).toBeInTheDocument();
  });

  it("확인 질문으로 넘어간다", async () => {
    renderAt(`/reports/${RA}/claim/${F_QUESTION}`);
    expect(await screen.findByText("한 가지만 더 확인할게요", {}, JUDGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 보기" })).toBeInTheDocument();
  });

  it("실패: 남은 횟수는 보이고 어느 항목이 틀렸는지는 안 보인다", async () => {
    renderAt(`/reports/${RB}/claim/${F_FAIL}`);
    const status = await screen.findByTestId("claim-fail", {}, JUDGE);
    expect(status).toHaveTextContent("설명과 일치하지 않아요");
    expect(status).toHaveTextContent("3번 중 2번");
    expect(screen.queryByRole("list", { name: "맞은 항목" })).toBeNull();
    const all = document.body.textContent ?? "";
    expect(leakedLabel(all)).toBeUndefined();
    expect(all).not.toMatch(/틀린 항목|맞지 않은 항목|일치한 항목/);
    expect(screen.getByText(/설명을 안 고치고 다시 누르면 횟수를 쓰지 않아요/)).toBeInTheDocument();
  });

  it("잠김(3회 소진)", async () => {
    renderAt(`/reports/${RB}/claim/${F_LOCKED}`);
    expect(await screen.findByText("확인 기회를 모두 썼어요", {}, JUDGE)).toBeInTheDocument();
    expect(leakedLabel(document.body.textContent ?? "")).toBeUndefined();
  });

  it("대면 확인(409 IN_PERSON_REQUIRED)", async () => {
    renderAt(`/reports/${RA}/claim/${F_INPERSON}`);
    expect(await screen.findByText("보관처에서 직접 확인해요", {}, JUDGE)).toBeInTheDocument();
    expect(screen.getByText("학생증을 가져가 주세요")).toBeInTheDocument();
  });

  it("이전 결과를 다시 받으면 안내 토스트", async () => {
    localStorage.setItem("chajeumpyo.mock.reused", "1");
    renderAt(`/reports/${RB}/claim/${F_FAIL}`);
    expect(await screen.findByText("이전 결과예요. 횟수는 그대로예요.", {}, JUDGE)).toBeInTheDocument();
  });
});

describe("L-09 확인 질문", () => {
  const entry = {
    pathname: "/claims/at-22222222/question",
    search: `?r=${RA}&f=${F_QUESTION}`,
    state: { question: "손잡이는 어떤 재질이었나요?" },
  };

  it("질문은 하나, 한 번만 경고, 답은 한 번만 보낸다", async () => {
    renderAt(entry);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByText("손잡이는 어떤 재질이었나요?")).toBeInTheDocument();
    expect(screen.getByText("한 번만 답할 수 있어요")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("답"), "플라스틱");
    const send = screen.getByRole("button", { name: "답 보내기" });
    await userEvent.click(send);
    // 보낸 뒤에는 입력과 버튼이 사라져 다시 보낼 수 없다
    expect(screen.queryByRole("button", { name: "답 보내기" })).toBeNull();
    expect(screen.queryByLabelText("답")).toBeNull();
    const status = await screen.findByTestId("claim-fail", {}, JUDGE);
    expect(status).toHaveTextContent("3번 중 1번");
    expect(screen.queryByRole("button", { name: /질문/ })).toBeNull();
  });

  it("맞게 답하면 통과", async () => {
    renderAt(entry);
    await userEvent.type(screen.getByLabelText("답"), "나무");
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("내 물건이 맞아요", {}, JUDGE)).toBeInTheDocument();
  });
});

describe("L-10 → L-11 → L-12", () => {
  it("보관처 물건은 수령 QR 받기, QR 코드 보기는 4자씩 끊고 복사는 원래 토큰", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(`/items/${F_PASS}`);
    await userEvent.click(await screen.findByRole("button", { name: /수령 QR 받기/ }, JUDGE));
    await userEvent.click(await screen.findByRole("button", { name: /코드 보기/ }));
    const code = screen.getByTestId("qr-code-text").textContent ?? "";
    const raw = code.replaceAll(" ", "");
    expect(raw).toHaveLength(28);
    expect(code).toBe(groupToken(raw));
    expect(code.split(" ").every((g) => g.length <= 4)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /코드 복사/ }));
    expect(writeText).toHaveBeenCalledWith(raw);
    expect(screen.getByText(/다시 받으면 지금 QR과 코드는 바로 못 써요/)).toBeInTheDocument();
  });

  it("체험 계정은 QR 대신 시연 완료", async () => {
    renderAt(`/items/${F_PASS}/qr`, { ...MEMBER, isDemo: true });
    expect(await screen.findByText("시연: 보관처에서 수령 처리됨")).toBeInTheDocument();
  });

  it("그 자리 물건은 찾았어요 → 기록 완료", async () => {
    renderAt(`/items/${F_QUESTION}`);
    await userEvent.click(await screen.findByRole("button", { name: /찾았어요/ }, JUDGE));
    await userEvent.click(await screen.findByRole("button", { name: "네, 찾았어요" }));
    expect(await screen.findByText("찾았다고 기록했어요")).toBeInTheDocument();
  });
});

describe("L-02 회원가입", () => {
  it("학교 이메일이 아니면 오류", async () => {
    renderAt("/signup", null);
    await userEvent.type(screen.getByLabelText("학교 이메일"), "a@gmail.com");
    await userEvent.click(screen.getByRole("checkbox", { name: /사람인지/ }));
    await userEvent.click(screen.getByRole("button", { name: "인증 코드 받기" }));
    expect(screen.getByText("학교 이메일(@skuniv.ac.kr)만 쓸 수 있어요.")).toBeInTheDocument();
  });

  it("코드 5분 타이머, 다시 받기 대기 시간", async () => {
    renderAt("/signup", null);
    await userEvent.type(screen.getByLabelText("학교 이메일"), "a@skuniv.ac.kr");
    await userEvent.click(screen.getByRole("checkbox", { name: /사람인지/ }));
    await userEvent.click(screen.getByRole("button", { name: "인증 코드 받기" }));
    const timer = await screen.findByText(/남은 시간/);
    expect(timer).toHaveTextContent(/0?[45]:[0-5]\d/);
    expect(screen.getByText(/다시 받기 \(0?[01]:[0-5]\d 뒤\)/)).toBeInTheDocument();
  });
});

describe("탭 첫 화면에는 뒤로 가기가 없다", () => {
  it.each(["/home", "/notifications", "/me"])("%s", async (path) => {
    renderAt(path);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole("button", { name: "뒤로 가기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "뒤로 가기" })).toBeNull();
    expect(within(document.body).getAllByRole("navigation").length).toBeGreaterThan(0);
  });
});
