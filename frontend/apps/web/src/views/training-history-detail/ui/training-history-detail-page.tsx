import { Link, useParams } from "react-router";

export function TrainingHistoryDetailPage() {
  const { id } = useParams();

  return (
    <section className="flex flex-col gap-4">
      <Link
        to="/training-history"
        className="text-sm font-semibold text-gray-500 hover:text-ink"
      >
        ← 교육이력 조회로 돌아가기
      </Link>
      <h1 className="text-xl font-bold text-ink">교육이력 상세</h1>
      <p className="text-sm text-ink-2">교육이력({id}) 상세 내용이 표시됩니다.</p>
    </section>
  );
}
