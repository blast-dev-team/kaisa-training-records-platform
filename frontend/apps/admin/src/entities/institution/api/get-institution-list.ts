import { apiClient } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionListQuery } from './query/institution-list-query'
import type { Institution } from '../model/institution'

export const getInstitutionList = async (query: InstitutionListQuery): Promise<Institution[]> => {
  const { data } = await apiClient.get<InstitutionDto[]>('/institutions', {
    params: {
      search: query.q || undefined,
      is_active: query.isActive,
    },
  })
  return data.map(mapInstitution)
}
