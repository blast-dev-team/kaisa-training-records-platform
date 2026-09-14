import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { TrainingRecordDto } from './dto/training-record-dto'
import { mapTrainingRecord } from './map-training-record'
import type { TrainingRecordListQuery } from './query/training-record-list-query'
import type { TrainingRecord } from '../model/training-record'

export const getTrainingRecordList = async (
  query: TrainingRecordListQuery,
): Promise<Paged<TrainingRecord>> => {
  const { data } = await apiClient.get<PagedResponse<TrainingRecordDto>>('/training-records', {
    params: {
      trainee_id: query.traineeId || undefined,
      source: query.source || undefined,
      completion_status: query.completionStatus || undefined,
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
