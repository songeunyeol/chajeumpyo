import { createBrowserRouter, type RouteObject } from "react-router";
import { DemoStartPage } from "@/pages/common/demo-start";
import { LandingPage } from "@/pages/common/landing";
import { MePage } from "@/pages/common/me-page";
import { NotificationsPage } from "@/pages/common/notifications-page";
import { FinderDetailsPage } from "@/pages/finder/details-page";
import { FinderFlowLayout } from "@/pages/finder/flow-context";
import { FinderPhotoPage } from "@/pages/finder/photo-page";
import { FinderResultPage } from "@/pages/finder/result-page";
import { FinderUploadingPage } from "@/pages/finder/uploading-page";
import { CandidatesPage } from "@/pages/lost/candidates-page";
import { ClaimPage } from "@/pages/lost/claim-page";
import { HomePage } from "@/pages/lost/home-page";
import { LoginPage } from "@/pages/lost/login-page";
import { PickupDonePage } from "@/pages/lost/pickup-done-page";
import { PickupQrPage } from "@/pages/lost/pickup-qr-page";
import { QuestionPage } from "@/pages/lost/question-page";
import { ReportEditPage } from "@/pages/lost/report-edit-page";
import { ReportNewPage } from "@/pages/lost/report-new-page";
import { RevealPage } from "@/pages/lost/reveal-page";
import { SignupPage } from "@/pages/lost/signup-page";
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
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },

  // 분실자 (로그인 후)
  {
    element: <RequireMember />,
    children: [
      { path: "/home", element: <HomePage /> },
      { path: "/notifications", element: <NotificationsPage /> },
      { path: "/me", element: <MePage /> },
      { path: "/reports/new", element: <ReportNewPage /> },
      { path: "/reports/:reportId", element: <CandidatesPage /> },
      { path: "/reports/:reportId/edit", element: <ReportEditPage /> },
      {
        path: "/reports/:reportId/claim/:foundItemId",
        element: <ClaimPage />,
      },
      { path: "/claims/:attemptId/question", element: <QuestionPage /> },
      { path: "/items/:foundItemId", element: <RevealPage /> },
      { path: "/items/:foundItemId/qr", element: <PickupQrPage /> },
      { path: "/items/:foundItemId/done", element: <PickupDonePage /> },
    ],
  },

  // 관리자 (학생은 받지 않게 경로째 지연 로드)
  {
    path: "/admin/login",
    lazy: async () => ({ Component: (await import("@/pages/admin/login-page")).AdminLoginPage }),
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        lazy: async () => ({ Component: (await import("@/components/layout/admin-shell")).AdminShell }),
        children: [
          {
            path: "/admin",
            lazy: async () => ({ Component: (await import("@/pages/admin/home-page")).AdminHomePage }),
          },
          {
            path: "/admin/items",
            lazy: async () => ({ Component: (await import("@/pages/admin/items-page")).AdminItemsPage }),
          },
          {
            path: "/admin/items/:id",
            lazy: async () => ({ Component: (await import("@/pages/admin/item-detail-page")).AdminItemDetailPage }),
          },
          {
            path: "/admin/scan",
            lazy: async () => ({ Component: (await import("@/pages/admin/scan-page")).AdminScanPage }),
          },
          { path: "/admin/hotspots", element: <P id="A-06" title="분실 다발 카드" flow="admin" /> },
        ],
      },
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
