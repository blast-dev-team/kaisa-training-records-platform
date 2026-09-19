import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionListQuery } from './query/institution-list-query'
import type { Institution } from '../model/institution'

export const getInstitutionList = async (
  query: InstitutionListQuery,
): Promise<Paged<Institution>> => {
  const { data } = await apiClient.get<PagedResponse<InstitutionDto>>('/institutions', {
    params: {
      search: query.q || undefined,
      is_active: query.isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapInstitution),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
