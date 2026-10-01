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
        (!query.gradeId || t.membershipGradeId === query.gradeId) &&
        (!query.supervisorGrade ||
          (query.supervisorGrade === 'none'
            ? t.supervisorGrade === null
            : t.supervisorGrade === query.supervisorGrade)) &&
        (!query.birthDate || t.birthDate === query.birthDate),
    )
    const dir = query.sort && query.order ? query.order : null
    const sortValue = (t: (typeof MOCK_TRAINEES)[number]) =>
      query.sort === 'grade_expires_at' ? t.gradeExpiresAt : query.sort === 'updated_at' ? t.updatedAt : t.createdAt
    const sorted = dir && query.sort
      ? [...filtered].sort((a, b) => {
          if (query.sort === 'grade_expires_at') {
            // nulls last — 만료일 없는 행(연간 외)은 정렬 대상 맨 뒤로
            if (!a.gradeExpiresAt && !b.gradeExpiresAt) return 0
            if (!a.gradeExpiresAt) return 1
            if (!b.gradeExpiresAt) return -1
          }
          const av = sortValue(a) ?? ''
          const bv = sortValue(b) ?? ''
          return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        })
      : filtered
    return mockPage(sorted, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<TraineeDto>>('/trainees', {
    params: {
      search: query.q || undefined,
      review_status: query.reviewStatus || undefined,
      grade_id: query.gradeId || undefined,
      supervisor_grade: query.supervisorGrade || undefined,
      birth_date: query.birthDate || undefined,
      sort: query.sort || undefined,
      order: query.order || undefined,
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
