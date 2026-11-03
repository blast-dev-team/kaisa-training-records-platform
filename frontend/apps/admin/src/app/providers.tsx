import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { captureQueryError } from "@/src/shared/lib/sentry";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          // 쿼리 에러는 전역 핸들러에 안 걸린다 — 서버 5xx·네트워크 오류만 Sentry 수집
          onError: captureQueryError,
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
