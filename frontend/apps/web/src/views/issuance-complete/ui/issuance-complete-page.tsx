import { Link } from "react-router";

export function IssuanceCompletePage() {
  return (
    <section className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-xl font-bold text-ink">발급이 완료되었습니다</h1>
      <p className="text-sm text-ink-2">발급 내역은 발급 결제 내역에서 확인할 수 있습니다.</p>
      <Link
        to="/payment-history"
        className="text-sm font-semibold text-primary-600 hover:text-primary-700"
      >
        발급 결제 내역 보기 →
      </Link>
    </section>
  );
}
