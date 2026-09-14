import { apiClient, type PagedResponse, type Paged } from '@/src/shared/api'
import type { CertificateDto } from './dto/certificate-dto'
import { mapCertificate } from './map-certificate'
import type { CertificateListQuery } from './query/certificate-list-query'
import type { Certificate } from '../model/certificate'

export const getCertificateList = async (
  query: CertificateListQuery,
): Promise<Paged<Certificate>> => {
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
