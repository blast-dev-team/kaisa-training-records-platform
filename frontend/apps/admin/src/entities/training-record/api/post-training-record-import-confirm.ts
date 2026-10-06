import { apiClient } from '@/src/shared/api'
import type {
  TrainingRecordImportConfirmItem,
  TrainingRecordImportResult,
} from '../model/training-record'

/** 프리뷰에서 확정한 행 일괄 등록 — 중복은 건너뛴다 */
export const postTrainingRecordImportConfirm = async (
  items: TrainingRecordImportConfirmItem[],
): Promise<TrainingRecordImportResult> => {
  const { data } = await apiClient.post<TrainingRecordImportResult>(
    '/training-records/import-confirm',
    { rows: items },
  )
  return data
}
