import { apiClient } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionInput, Institution } from '../model/institution'

export const patchInstitution = async (
  institutionId: string,
  input: Partial<InstitutionInput>,
): Promise<Institution> => {
  const { data } = await apiClient.patch<InstitutionDto>(`/institutions/${institutionId}`, input)
  return mapInstitution(data)
}
