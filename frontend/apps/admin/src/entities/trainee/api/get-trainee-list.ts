import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { TraineeDto } from './dto/trainee-dto'
import { mapTrainee } from './map-trainee'
import type { TraineeListQuery } from './query/trainee-list-query'
import type { Trainee } from '../model/trainee'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_TRAINEES } from './trainee-mock'

export const getTraineeList = async (query: TraineeListQuery): Promise<Paged<Trainee>> => {
  if (USE_MOCK) {
    await mockDelay()
    const q = (query.q ?? '').trim()
    const filtered = MOCK_TRAINEES.filter(
      t =>
        (!q || t.name.includes(q) || t.traineeNo.includes(q) || (t.email ?? '').includes(q)) &&
        (!query.reviewStatus || t.reviewStatus === query.reviewStatus) &&
        (!query.gradeId || t.membershipGradeId === query.gradeId),
    )
    return mockPage(filtered, query.page, query.limit)
  }
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
