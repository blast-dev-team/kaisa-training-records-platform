import { apiClient } from '@/src/shared/api'
import type { TraineeImportPreviewResult } from '../model/trainee'

/** 엑셀 파싱 + 중복 판별 결과 — 확정 전 프리뷰·편집용 */
export const postTraineeImportPreview = async (
  file: File,
): Promise<TraineeImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<TraineeImportPreviewResult>(
    '/trainees/import-preview',
    formData,
    // 인스턴스 기본값(application/json)이 FormData 를 JSON 으로 깨뜨린다 — 요청별로 덮어쓴다
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
