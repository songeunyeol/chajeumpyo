import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useCallback, useState } from "react";
import { AuthProvider, defaultOnExpired, type ExpiredReason, type SessionScope } from "@/lib/auth";
import { isApiError } from "@/lib/http";

/** 4xx는 다시 시도해도 같으므로 한 번도 재시도하지 않는다. 네트워크 오류·5xx는 한 번만 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

/**
 * 앱 최상단에 한 번: <ApiProvider onExpired={...}><RouterProvider .../></ApiProvider>
 * 세션이 바뀌면(로그인·로그아웃·만료) 그 범위의 캐시를 지운다. 다른 계정의 후보·알림이 남지 않게.
 */
export function ApiProvider({
  children,
  client,
  onExpired,
}: {
  children: ReactNode;
  client?: QueryClient;
  onExpired?: (reason: ExpiredReason) => void;
}) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  const clearScope = useCallback(
    (scope: SessionScope) => {
      queryClient.removeQueries({ queryKey: [scope] });
    },
    [queryClient],
  );
  const handleExpired = useCallback(
    (reason: ExpiredReason) => {
      clearScope(reason.scope);
      (onExpired ?? defaultOnExpired)(reason);
    },
    [clearScope, onExpired],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider onSessionChange={clearScope} onExpired={handleExpired}>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
