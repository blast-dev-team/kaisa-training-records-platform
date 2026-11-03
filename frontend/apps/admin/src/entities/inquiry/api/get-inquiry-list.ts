import { apiClient, type Paged, type PagedResponse } from '@/src/shared/api'
import type { InquiryListItemDto } from './dto/inquiry-dto'
import { mapInquiryListItem } from './map-inquiry'
import type { InquiryListQuery } from './query/inquiry-list-query'
import type { InquiryListItem } from '../model/inquiry'

export const getInquiryList = async (query: InquiryListQuery): Promise<Paged<InquiryListItem>> => {
  const { data } = await apiClient.get<PagedResponse<InquiryListItemDto>>('/inquiries', {
    params: {
      status: query.status || undefined,
      category: query.category || undefined,
      author_type: query.authorType || undefined,
      search: query.search || undefined,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
      page: query.page,
      limit: query.limit,
    },
  })
  return {
    items: data.items.map(mapInquiryListItem),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
