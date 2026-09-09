import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { TraineeDto } from './dto/trainee-dto'
import { mapTrainee } from './map-trainee'
import type { TraineeListQuery } from './query/trainee-list-query'
import type { Trainee } from '../model/trainee'

export const getTraineeList = async (query: TraineeListQuery): Promise<Paged<Trainee>> => {
  const { data } = await apiClient.get<PagedResponse<TraineeDto>>('/trainees', {
    params: {
      search: query.q || undefined,
      review_status: query.reviewStatus || undefined,
      grade_id: query.gradeId || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapTrainee),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
