import { apiClient } from '@/src/shared/api'

export interface MatchPreviewMatched {
  trainee_id: string
  name: string
  trainee_no: string | null
  cert_no: string | null
  /** cert_no | trainee_no | name — 어떤 키로 맞췄는지 */
  matched_by: string
}

export interface MatchPreviewUnmatched {
  row_number: number
  name: string | null
  /** 엑셀에 있었지만 대조 실패한 증번호 — 직접 등록으로 신규 생성 시 재사용 */
  cert_no: string | null
  reason: string
}

export interface TraineeMatchPreviewResult {
  total_rows: number
  matched: MatchPreviewMatched[]
  unmatched: MatchPreviewUnmatched[]
}

/** 엑셀 행 → 교육생 대조 — 매칭된 교육생 목록(연결 전 자동 선택용) */
export const postTrainingRecordMatchPreview = async (
  file: File,
): Promise<TraineeMatchPreviewResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<TraineeMatchPreviewResult>(
    '/training-records/match-preview',
    formData,
    // 인스턴스 기본값(application/json)이 FormData 를 JSON 으로 깨뜨린다 — 요청별로 덮어쓴다
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
