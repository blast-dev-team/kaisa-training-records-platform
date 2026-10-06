import { apiClient } from '@/src/shared/api'
import type {
  GradeImportRematchInput,
  GradeImportRowResult,
} from '../model/grade-import'

/** 행 편집 후 재매칭 — 증번호 정정·생년 오타 수정 등 사유별 값을 고쳐 다시 판정 */
export const postTraineeGradeImportRematch = async (
  body: GradeImportRematchInput,
): Promise<GradeImportRowResult> => {
  const { data } = await apiClient.post<GradeImportRowResult>(
    '/trainees/grade-import-rematch',
    body,
  )
  return data
}
