import { queryOptions } from '@tanstack/react-query'
import { getCertificateList } from './get-certificate-list'
import type { CertificateListQuery } from './query/certificate-list-query'

export const certificateQueries = {
  all: () => ['certificates'] as const,
  lists: () => [...certificateQueries.all(), 'list'] as const,
  list: (query: CertificateListQuery) =>
    queryOptions({
      queryKey: [...certificateQueries.lists(), query],
      queryFn: () => getCertificateList(query),
    }),
}

