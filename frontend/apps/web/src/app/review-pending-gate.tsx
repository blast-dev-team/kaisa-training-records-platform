import { useAuthStore } from "@/src/shared/store/auth-store";

/**
 * 교육생 미연결(수동 심사 대기) 게이트.
 *
 * 본인인증 자체는 완료됐지만 이관 데이터와의 매칭 심사가 끝나지 않은 회원은
 * 보호 페이지(이력·발급·결제) 대신 이 화면만 보인다.
 * 어드민이 심사를 승인해 교육생을 연결하면 다음 로그인부터 정상 화면이 나온다.
 */
export function ReviewPendingGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const traineeLinked = useAuthStore((state) => state.traineeLinked);
  const userName = useAuthStore((state) => state.userName);
  const signOut = useAuthStore((state) => state.signOut);

  if (!isAuthenticated || traineeLinked) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 font-sans">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-amber-50 text-xl">
          ⏳
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-gray-900">
          감리원 심사가 진행 중이에요
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-gray-500">
          {userName}님의 본인인증은 완료됐어요.
          <br />
          가입 정보와 기존 감리원 데이터의 매칭 심사가 끝나면
          <br />
          로그인 후 교육 내역과 확인서 발급을 이용할 수 있어요.
        </p>
        <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-[13px] leading-[1.6] text-gray-500">
          심사는 영업일 기준 1~2일이 걸려요.
          <br />
          문의: 협회 담당자
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800"
          onClick={() => signOut()}
        >
          닫기
        </button>
      </section>
    </div>
  );
}
