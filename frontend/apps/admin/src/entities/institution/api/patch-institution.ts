import { apiClient } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionInput, Institution } from '../model/institution'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_INSTITUTIONS } from './institution-mock'

export const patchInstitution = async (
  institutionId: string,
  input: Partial<InstitutionInput>,
): Promise<Institution> => {
  if (USE_MOCK) {
    await mockDelay()
    const institution = MOCK_INSTITUTIONS.find(i => i.id === institutionId)
    if (!institution) throw new Error('교육기관을 찾을 수 없어요')
    if (input.name !== undefined) institution.name = input.name
    if (input.institution_code !== undefined) institution.institutionCode = input.institution_code
    if (input.is_active !== undefined) institution.isActive = input.is_active
    return { ...institution }
  }
  const { data } = await apiClient.patch<InstitutionDto>(`/institutions/${institutionId}`, input)
  return mapInstitution(data)
}
