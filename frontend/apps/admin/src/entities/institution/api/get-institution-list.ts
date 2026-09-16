import { apiClient } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionListQuery } from './query/institution-list-query'
import type { Institution } from '../model/institution'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_INSTITUTIONS } from './institution-mock'

export const getInstitutionList = async (query: InstitutionListQuery): Promise<Institution[]> => {
  if (USE_MOCK) {
    await mockDelay()
    const q = (query.q ?? '').trim()
    return MOCK_INSTITUTIONS.filter(
      i =>
        (query.isActive === undefined || i.isActive === query.isActive) &&
        (!q || i.name.includes(q)),
    )
  }
  const { data } = await apiClient.get<InstitutionDto[]>('/institutions', {
    params: {
      search: query.q || undefined,
      is_active: query.isActive,
    },
  })
  return data.map(mapInstitution)
}
