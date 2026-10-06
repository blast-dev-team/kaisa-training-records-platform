import { apiClient } from '@/src/shared/api'
import type { GradeImportPreviewResult } from '../model/grade-import'

/** 협회 회원명부 엑셀 → 기존 교육생 등급 매칭·검증 리포트 — 확정 전 확인용 */
export const postTraineeGradeImportPreview = async (
  file: File,
): Promise<GradeImportPreviewResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<GradeImportPreviewResult>(
    '/trainees/grade-import-preview',
    formData,
    // 인스턴스 기본값(application/json)이 FormData 를 JSON 으로 깨뜨린다 — 요청별로 덮어쓴다
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
