import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { getSession } from "@/src/shared/api/get-session";
import { useAuthStore } from "@/src/shared/store/auth-store";

/**
 * 새로고침 복구 게이트 — 서버 세션으로 인증 상태를 되살린다.
 *
 * auth-store 는 메모리 전용이라 새로고침하면 비고, httponly 쿠키는 살아 있다.
 * 부팅 시 GET /api/me/session 이 200 이면 signIn 으로 복구(잔여 시간 포함)한다.
 *
 * children 은 signIn 적용 "후에" 마운트한다 — 먼저 마운트하면 MainLayout 의
 * 미인증 가드(<Navigate to="/" />)가 복구보다 먼저 돌아 intro 로 튕긴다.
 */
function SessionGate({ children }: { children: ReactNode }) {
  const signIn = useAuthStore((state) => state.signIn);
  const queryClient = useQueryClient();
  const [isRestored, setIsRestored] = useState(false);

  // 인증 해제·만료 시 이전 사람의 서버 데이터를 캐시에서 비운다 — 목록 쿼리키에
  // 사용자 식별자가 없어, 같은 탭에서 다음 사람이 인증하면 staleTime 동안
  // 이전 사람의 교육이력·결제내역이 그대로 보였다.
  useEffect(
    () =>
      useAuthStore.subscribe((state, prev) => {
        if (!prev.isAuthenticated || state.isAuthenticated) return;
        queryClient.setQueryData(["session"], null);
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== "session",
        });
      }),
    [queryClient],
  );
  const { data, isPending } = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (isPending) return;
    if (data)
      signIn(
        data.name,
        new Date(data.expires_at).getTime(),
        data.trainee_linked !== false,
        data.is_super === true,
      );
    setIsRestored(true);
  }, [data, isPending, signIn]);

  if (isPending || !isRestored) return null;
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate>{children}</SessionGate>
    </QueryClientProvider>
  );
}
