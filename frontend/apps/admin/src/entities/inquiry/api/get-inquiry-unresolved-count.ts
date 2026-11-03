import { apiClient } from '@/src/shared/api'

export const getInquiryUnresolvedCount = async (): Promise<number> => {
  const { data } = await apiClient.get<{ count: number }>('/inquiries/unresolved-count')
  return data.count
}
