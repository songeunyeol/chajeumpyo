import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

/** 라우터·쿼리 클라이언트를 감싼 렌더 */
export function renderWithProviders(ui: React.ReactElement, { route = "/", path = "*" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
