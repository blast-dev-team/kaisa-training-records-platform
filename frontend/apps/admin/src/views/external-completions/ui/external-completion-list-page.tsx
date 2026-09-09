import { TrainingRecordListPage } from '@/src/views/training-records'

/** 외부 수료 뷰 — 감리 교육 화면을 source=external 고정으로 재사용 */
export function ExternalCompletionListPage() {
  return <TrainingRecordListPage variant="external" />
}
