import { apiClient } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionInput, Institution } from '../model/institution'

export const postInstitution = async (input: InstitutionInput): Promise<Institution> => {
  const { data } = await apiClient.post<InstitutionDto>('/institutions', input)
  return mapInstitution(data)
}
