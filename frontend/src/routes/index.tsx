import { createBrowserRouter, type RouteObject } from "react-router";
import { DemoStartPage } from "@/pages/common/demo-start";
import { LandingPage } from "@/pages/common/landing";
import { FinderDetailsPage } from "@/pages/finder/details-page";
import { FinderFlowLayout } from "@/pages/finder/flow-context";
import { FinderPhotoPage } from "@/pages/finder/photo-page";
import { FinderResultPage } from "@/pages/finder/result-page";
import { FinderUploadingPage } from "@/pages/finder/uploading-page";
import { ScreenPlaceholder as P } from "@/pages/placeholder";
import { RequireAdmin, RequireMember } from "./guards";

/**
 * 화면 ID ↔ 경로 (docs/frontend/screens.md). 경로를 바꾸면 frontend/README.md 표도 고친다.
 * C-02 동의는 바텀시트라 경로가 없고 F-01·C-03·L-02에서 연다.
 * L-07 판정 중과 L-08 판정 결과는 같은 경로에서 상태로 바뀐다.
 */
export const routes: RouteObject[] = [
  // 공통
  { path: "/", element: <LandingPage /> },
  { path: "/demo", element: <DemoStartPage /> },
  { path: "/map", element: <P id="C-07" title="캠퍼스 지도" flow="lost" /> },
  { path: "/status/:kind", element: <P id="C-06" title="상태 화면" flow="lost" /> },

  // 습득자
  {
    element: <FinderFlowLayout />,
    children: [
      { path: "/found/new", element: <FinderPhotoPage /> },
      { path: "/found/new/details", element: <FinderDetailsPage /> },
      { path: "/found/new/uploading", element: <FinderUploadingPage /> },
      { path: "/found/new/result", element: <FinderResultPage /> },
    ],
  },

  // 분실자 (로그인 전)
  { path: "/login", element: <P id="L-01" title="로그인" flow="lost" /> },
  { path: "/signup", element: <P id="L-02" title="회원가입" flow="lost" /> },

  // 분실자 (로그인 후)
  {
    element: <RequireMember />,
    children: [
      { path: "/home", element: <P id="L-03" title="홈" flow="lost" tabs /> },
      { path: "/notifications", element: <P id="C-04" title="알림" flow="lost" tabs /> },
      { path: "/me", element: <P id="C-05" title="내 정보" flow="lost" tabs /> },
      { path: "/reports/new", element: <P id="L-04" title="분실 신고" flow="lost" /> },
      { path: "/reports/:reportId", element: <P id="L-05" title="후보 목록" flow="lost" /> },
      { path: "/reports/:reportId/edit", element: <P id="L-06" title="신고 상세" flow="lost" /> },
      {
        path: "/reports/:reportId/claim/:foundItemId",
        element: <P id="L-07·L-08" title="판정" flow="lost" />,
      },
      { path: "/claims/:attemptId/question", element: <P id="L-09" title="확인 질문" flow="lost" /> },
      { path: "/items/:foundItemId", element: <P id="L-10" title="사진·위치" flow="lost" /> },
      { path: "/items/:foundItemId/qr", element: <P id="L-11" title="수령 QR" flow="lost" /> },
      { path: "/items/:foundItemId/done", element: <P id="L-12" title="수령 완료" flow="lost" /> },
    ],
  },

  // 관리자
  { path: "/admin/login", element: <P id="A-01" title="관리자 로그인" flow="admin" /> },
  {
    element: <RequireAdmin />,
    children: [
      { path: "/admin", element: <P id="A-02" title="관리자 홈" flow="admin" /> },
      { path: "/admin/items", element: <P id="A-03" title="습득물 목록" flow="admin" /> },
      { path: "/admin/items/:id", element: <P id="A-04" title="습득물 상세" flow="admin" /> },
      { path: "/admin/scan", element: <P id="A-05" title="QR 스캔" flow="admin" /> },
      { path: "/admin/hotspots", element: <P id="A-06" title="분실 다발 카드" flow="admin" /> },
    ],
  },

  // 개발 서버에서만. 배포 빌드에서는 이 줄이 통째로 빠지고 미리보기 파일도 번들에 들어가지 않는다
  ...(import.meta.env.DEV
    ? [
        {
          path: "/__dev/:name",
          lazy: async () => ({ Component: (await import("@/pages/dev/preview")).DevPreviewPage }),
        },
      ]
    : []),
  { path: "*", element: <P id="C-06" title="페이지를 찾을 수 없어요" flow="lost" /> },
];

export const createRouter = () => createBrowserRouter(routes);
