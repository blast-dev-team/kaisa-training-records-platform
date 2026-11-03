import { apiClient } from '@/src/shared/api'
import type { InquiryDetailDto } from './dto/inquiry-dto'
import { mapInquiryDetail } from './map-inquiry'
import type { InquiryDetail } from '../model/inquiry'

export const putInquiryAnswer = async (id: string, answer: string): Promise<InquiryDetail> => {
  const { data } = await apiClient.put<InquiryDetailDto>(`/inquiries/${id}/answer`, { answer })
  return mapInquiryDetail(data)
}
