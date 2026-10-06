import { apiClient } from '@/src/shared/api'
import type { TrainingRecordImportPreviewResult } from '../model/training-record'

/** 교육내역 엑셀 파싱 + 감리원 매칭 — 확정 전 프리뷰용 */
export const postTrainingRecordImportPreview = async (
  file: File,
): Promise<TrainingRecordImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<TrainingRecordImportPreviewResult>(
    '/training-records/import-preview',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
