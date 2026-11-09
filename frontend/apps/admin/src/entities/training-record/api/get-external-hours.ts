import { apiClient } from '@/src/shared/api'
import type { ExternalHoursSummary } from '../model/external-hours'

interface ExternalHoursSummaryDto {
  window_start: string
  external_hours: number
  max_hours: number
  remaining_hours: number
}

/** 감리원의 최근 3년 외부교육 합계 — 수정 중인 이력은 excludeRecordId 로 뺀다 */
export const getExternalHours = async (
  traineeId: string,
  excludeRecordId?: string | null,
): Promise<ExternalHoursSummary> => {
  const { data } = await apiClient.get<ExternalHoursSummaryDto>('/training-records/external-hours', {
    params: { trainee_id: traineeId, exclude_record_id: excludeRecordId || undefined },
  })
  return {
    windowStart: data.window_start,
    externalHours: Number(data.external_hours),
    maxHours: Number(data.max_hours),
    remainingHours: Number(data.remaining_hours),
  }
}
