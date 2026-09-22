import { apiClient } from '@/src/shared/api'
import type { InstitutionDto } from './dto/institution-dto'
import { mapInstitution } from './map-institution'
import type { InstitutionInput, Institution } from '../model/institution'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_INSTITUTIONS } from './institution-mock'

export const postInstitution = async (input: InstitutionInput): Promise<Institution> => {
  if (USE_MOCK) {
    await mockDelay()
    const created: Institution = {
      id: `ins-${Date.now().toString(36)}`,
      name: input.name,
      institutionCode: input.institution_code ?? null,
      isActive: input.is_active ?? true,
      createdAt: new Date().toISOString().slice(0, 19),
    }
    MOCK_INSTITUTIONS.push(created)
    return { ...created }
  }
  const { data } = await apiClient.post<InstitutionDto>('/institutions', input)
  return mapInstitution(data)
}
