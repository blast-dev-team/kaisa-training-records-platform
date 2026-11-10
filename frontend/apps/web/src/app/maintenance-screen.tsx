/**
 * 전체 접근 차단 화면 — prod 데이터 정정 작업 중 임시 사용.
 *
 * main.tsx 에서 라우터 대신 이 화면만 렌더링해 모든 경로·새로고침·딥링크를 막는다.
 * API 세션 복구 쿼리도 돌지 않는다(Providers 우회) — 화면만 즉시 노출된다.
 * 작업 완료 후 이 커밋을 revert 하면 기존 라우터가 복원된다.
 */
export function MaintenanceScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 font-sans">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-gray-100 text-20">
          🔧
        </div>
        <h1 className="text-18 font-semibold tracking-[-0.02em] text-gray-900">
          사이트가 준비 중입니다.
        </h1>
        <p className="mt-3 text-15 leading-[1.6] text-gray-500">
          더 나은 서비스를 위해 전환 작업 중이에요.
          <br />
          잠시 후 다시 방문해 주세요.
        </p>
      </section>
    </div>
  );
}
