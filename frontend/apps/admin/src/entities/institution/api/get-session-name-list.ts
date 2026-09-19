import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { SessionNameListQuery } from './query/institution-list-query'
import type { SessionName } from '../model/institution'

export interface SessionNameDto {
  id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export const getSessionNameList = async (
  query: SessionNameListQuery,
): Promise<Paged<SessionName>> => {
  const { data } = await apiClient.get<PagedResponse<SessionNameDto>>('/session-names', {
    params: {
      search: query.q || undefined,
      is_active: query.isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(n => ({
      id: n.id,
      name: n.name,
      isActive: n.is_active,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    })),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
