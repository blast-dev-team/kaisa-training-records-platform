import { queryOptions } from '@tanstack/react-query'
import { getInquiryDetail } from './get-inquiry-detail'
import { getInquiryList } from './get-inquiry-list'
import { getInquiryUnresolvedCount } from './get-inquiry-unresolved-count'
import type { InquiryListQuery } from './query/inquiry-list-query'

export const inquiryQueries = {
  all: () => ['inquiries'] as const,
  lists: () => [...inquiryQueries.all(), 'list'] as const,
  list: (query: InquiryListQuery) =>
    queryOptions({
      queryKey: [...inquiryQueries.lists(), query],
      queryFn: () => getInquiryList(query),
      placeholderData: (prev) => prev,
    }),
  details: () => [...inquiryQueries.all(), 'detail'] as const,
  detail: (id: string) =>
    queryOptions({
      queryKey: [...inquiryQueries.details(), id],
      queryFn: () => getInquiryDetail(id),
      enabled: !!id,
    }),
  // 사이드바 뱃지 — 1분마다·탭 복귀 시 갱신. 답변 등록 시 all() 무효화로 즉시 갱신된다
  unresolvedCount: () =>
    queryOptions({
      queryKey: [...inquiryQueries.all(), 'unresolved-count'],
      queryFn: getInquiryUnresolvedCount,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    }),
}
