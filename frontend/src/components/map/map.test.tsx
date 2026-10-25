import type { BuildingListItem } from "@chajeumpyo/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildingSheet } from "@/pages/finder/building-sheet";
import { MapCard } from "./map-card";
import { loadNaverMaps, naverScriptUrl, onNaverAuthFailure, resetNaverLoader } from "./naver-loader";
import { mapBuildingFor, naverSearchUrl } from "./place-map";

const B: BuildingListItem[] = [
  { id: 1, name: "혜인관", lat: 37.615, lng: 127.013 },
  { id: 2, name: "청운관", lat: 37.616, lng: 127.012 },
  { id: 3, name: "북악관", lat: 37.614, lng: 127.011 },
];

afterEach(() => {
  resetNaverLoader();
  for (const s of document.head.querySelectorAll("script")) s.remove();
  delete window.naver;
  delete window.navermap_authFailure;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("C-07 네이버 지도 불러오기", () => {
  it("키가 없으면 스크립트를 넣지 않고 실패", async () => {
    await expect(loadNaverMaps("")).rejects.toThrow();
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("키가 있으면 v3 스크립트를 한 번만 넣고, 불러오면 성공", async () => {
    const p1 = loadNaverMaps("abc");
    const p2 = loadNaverMaps("abc");
    const s = document.head.querySelectorAll("script");
    expect(s).toHaveLength(1);
    expect(s[0]?.getAttribute("src")).toBe(naverScriptUrl("abc"));
    expect(naverScriptUrl("abc")).toBe("https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=abc");
    window.naver = { maps: {} as never };
    s[0]?.dispatchEvent(new Event("load"));
    await expect(p1).resolves.toBe(window.naver.maps);
    await expect(p2).resolves.toBe(window.naver.maps);
  });

  it("navermap_authFailure가 불리면 실패하고, 이미 뜬 지도에도 알린다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const heard = vi.fn();
    onNaverAuthFailure(heard);
    const p = loadNaverMaps("bad");
    window.navermap_authFailure?.();
    await expect(p).rejects.toThrow(/authFailure/);
    expect(heard).toHaveBeenCalled();
    await expect(loadNaverMaps("bad")).rejects.toThrow();
  });

  it("3초 안에 안 뜨면 실패", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = loadNaverMaps("slow");
    const caught = p.catch((e: Error) => e.message);
    vi.advanceTimersByTime(3001);
    expect(await caught).toMatch(/3000ms/);
  });
});

describe("C-07 지도 카드", () => {
  it("키가 없으면(테스트 환경) 바로 대체 화면", () => {
    render(<MapCard label="지도" buildings={B} fallback={<p>목록</p>} />);
    expect(screen.getByText("목록")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "지도" })).toBeNull();
  });

  it("F-02 건물 시트: 지도를 못 쓰면 한 줄 안내 + 검색 + 목록으로 고를 수 있다", async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BuildingSheet open onOpenChange={() => {}} buildings={B} onPick={pick} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("지도를 불러오지 못해서 건물 목록으로 보여 드려요.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("건물 이름 검색"), "청운");
    await user.click(screen.getByRole("radio", { name: /청운관/ }));
    await user.click(screen.getByRole("button", { name: "청운관으로 할게요" }));
    expect(pick).toHaveBeenCalledWith(2);
  });

  it("L-10 지도 건물: 보관처 안내에 든 건물, 없으면 물건의 건물. 길찾기 주소에 좌표 없음", () => {
    const place = { id: 9, name: "종합서비스센터", guideText: "혜인관 1층 정문 옆" };
    expect(mapBuildingFor({ id: 2, name: "청운관" }, place, B)?.id).toBe(1);
    expect(mapBuildingFor({ id: 2, name: "청운관" }, { ...place, guideText: "1층" }, B)?.id).toBe(2);
    expect(mapBuildingFor({ id: 3, name: "북악관" }, null, B)?.id).toBe(3);
    const url = naverSearchUrl("혜인관");
    expect(url).not.toMatch(/37\.|127\./);
    expect(decodeURIComponent(url)).toContain("서경대학교 혜인관");
  });
});
