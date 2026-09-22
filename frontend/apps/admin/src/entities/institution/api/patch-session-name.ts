import { apiClient } from '@/src/shared/api'
import type { SessionName, SessionNameInput } from '../model/institution'
import type { SessionNameDto } from './get-session-name-list'

export const patchSessionName = async (
  sessionNameId: string,
  body: Partial<SessionNameInput>,
): Promise<SessionName> => {
  const { data } = await apiClient.patch<SessionNameDto>(`/session-names/${sessionNameId}`, body)
  return {
    id: data.id,
    name: data.name,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
