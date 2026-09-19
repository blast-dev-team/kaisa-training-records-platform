import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecordListQuery } from './query/training-record-list-query'
import type { TrainingRecord } from '../model/training-record'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_TRAINING_RECORDS } from './training-record-mock'

export const getTrainingRecordList = async (
  query: TrainingRecordListQuery,
): Promise<Paged<TrainingRecord>> => {
  if (USE_MOCK) {
    await mockDelay()
    const filtered = MOCK_TRAINING_RECORDS.filter(
      r =>
        (!query.traineeId || r.traineeId === query.traineeId) &&
        (!query.sessionId || r.sessionId === query.sessionId) &&
        (!query.excludeSource || r.source !== query.excludeSource) &&
        (!query.source || r.source === query.source) &&
        (!query.completionStatus || r.completionStatus === query.completionStatus) &&
        (!query.search ||
          [r.courseName, r.institutionName, r.traineeName].some(v =>
            v?.toLowerCase().includes(query.search!.toLowerCase()),
          )),
    )
    return mockPage(filtered, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<TrainingRecordDto>>('/training-records', {
    params: {
      trainee_id: query.traineeId || undefined,
      session_id: query.sessionId || undefined,
      exclude_source: query.excludeSource || undefined,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
      source: query.source || undefined,
      completion_status: query.completionStatus || undefined,
      search: query.search || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapTrainingRecord),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
