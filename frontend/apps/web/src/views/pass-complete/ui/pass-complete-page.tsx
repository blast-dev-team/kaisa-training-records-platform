import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { postPassComplete } from "@/src/shared/api/post-pass-complete";
import {
  clearPendingPassState,
  readPendingPassState,
} from "@/src/shared/lib/portone/request-identity-verification";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { Button } from "@/src/shared/ui";

/**
 * 모바일 본인인증 복귀 화면 — PortOne 이 인증창을 마치고 `redirectUrl` 로 돌려보낸다.
 *
 * 모바일 인증창은 페이지를 이동시켜 인증 모달의 Promise 가 끝나지 않았고, 서버
 * complete 도 불리지 않아 로그인이 완료되지 않았다. 인증 시작 때 저장해 둔 state 로
 * 여기서 complete 를 마치고 교육이력으로 보낸다. 쿼리 `code` 가 있으면 실패·취소다.
 */
export function PassCompletePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const signIn = useAuthStore((state) => state.signIn);
  const setTraineeLinked = useAuthStore((state) => state.setTraineeLinked);
  const failCode = searchParams.get("code");
  const state = readPendingPassState();
  const failed = Boolean(failCode) || !state;

  const complete = useQuery({
    queryKey: ["pass-complete", state],
    queryFn: () => postPassComplete(state ?? ""),
    enabled: !failed,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (failed) clearPendingPassState();
  }, [failed]);

  useEffect(() => {
    const user = complete.data;
    if (!user) return;
    clearPendingPassState();
    // 교육생 미연결(수동 심사 대기) — 심사 대기 화면으로 갈린다 (인증 모달과 동일)
    if (user.reviewStatus === "manual_review") setTraineeLinked(false);
    signIn(user.name ?? undefined, undefined, undefined, user.isSuper);
    navigate("/training-history", { replace: true });
  }, [complete.data, navigate, setTraineeLinked, signIn]);

  if (failed || complete.isError) {
    return (
      <section className="mx-auto my-20 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center font-sans mobile:mx-5 mobile:w-auto mobile:px-5">
        <h1 className="text-18 font-semibold text-gray-900">본인인증이 완료되지 않았어요</h1>
        <p className="text-14 leading-[1.6] text-gray-500">
          {complete.error instanceof Error
            ? complete.error.message
            : "인증을 취소했거나 인증 중 문제가 생겼어요. 다시 시도해 주세요."}
        </p>
        <Link to="/" replace>
          <Button color="black" fullWidth>
            처음으로
          </Button>
        </Link>
      </section>
    );
  }

  return (
    <p className="my-20 text-center font-sans text-14 text-gray-500">
      본인인증 결과를 확인하고 있어요
    </p>
  );
}
