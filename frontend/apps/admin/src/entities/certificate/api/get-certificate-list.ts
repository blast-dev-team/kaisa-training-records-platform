import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { CertificateDto } from './dto/certificate-dto'
import { mapCertificate } from './map-certificate'
import type { CertificateListQuery } from './query/certificate-list-query'
import type { Certificate } from '../model/certificate'
import { USE_MOCK, mockDelay, mockPage } from '@/src/shared/api/mock'
import { MOCK_CERTIFICATES } from './certificate-mock'

export const getCertificateList = async (
  query: CertificateListQuery,
): Promise<Paged<Certificate>> => {
  if (USE_MOCK) {
    await mockDelay()
    const filtered = MOCK_CERTIFICATES.filter(
      c =>
        (!query.traineeId || c.traineeId === query.traineeId) &&
        (!query.status || c.status === query.status),
    )
    return mockPage(filtered, query.page, query.limit)
  }
  const { data } = await apiClient.get<PagedResponse<CertificateDto>>('/certificates', {
    params: {
      trainee_id: query.traineeId || undefined,
      status: query.status || undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    },
  })
  return {
    items: data.items.map(mapCertificate),
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.total_pages,
  }
}
