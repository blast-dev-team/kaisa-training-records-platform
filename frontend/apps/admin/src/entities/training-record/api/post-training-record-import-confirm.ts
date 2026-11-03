import { apiClient } from '@/src/shared/api'
import type {
  TrainingRecordImportConfirmItem,
  TrainingRecordImportResult,
} from '../model/training-record'

/** 프리뷰에서 확정한 행 일괄 등록 — 중복은 건너뛴다 */
export const postTrainingRecordImportConfirm = async (
  items: TrainingRecordImportConfirmItem[],
  /** true 면 서버도 평생·연간이 아닌 감리원 행을 등록하지 않는다 */
  paidOnly = false,
): Promise<TrainingRecordImportResult> => {
  const { data } = await apiClient.post<TrainingRecordImportResult>(
    '/training-records/import-confirm',
    { rows: items, paid_only: paidOnly },
  )
  return data
}
