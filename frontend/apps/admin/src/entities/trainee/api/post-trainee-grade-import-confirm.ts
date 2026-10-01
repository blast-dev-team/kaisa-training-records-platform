import { apiClient } from '@/src/shared/api'
import type {
  GradeImportConfirmItem,
  GradeImportResult,
} from '../model/grade-import'

/** 리포트에서 선택한 행의 회원등급·연락처를 일괄 적용 — 충돌·빈 값 규칙은 서버 재검증 */
export const postTraineeGradeImportConfirm = async (
  items: GradeImportConfirmItem[],
): Promise<GradeImportResult> => {
  const { data } = await apiClient.post<GradeImportResult>(
    '/trainees/grade-import-confirm',
    { items },
  )
  return data
}
