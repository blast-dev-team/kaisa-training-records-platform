import { apiClient } from '@/src/shared/api'
import type {
  TraineeImportConfirmItem,
  TraineeImportResult,
} from '../model/trainee'

/** 프리뷰에서 편집 완료된 행 일괄 등록 — 중복은 확정 시점에 다시 걸러진다 */
export const postTraineeImportConfirm = async (
  items: TraineeImportConfirmItem[],
): Promise<TraineeImportResult> => {
  const { data } = await apiClient.post<TraineeImportResult>(
    '/trainees/import-confirm',
    { items },
  )
  return data
}
