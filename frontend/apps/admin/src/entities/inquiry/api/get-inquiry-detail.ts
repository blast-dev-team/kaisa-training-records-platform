import { apiClient } from '@/src/shared/api'
import type { InquiryDetailDto } from './dto/inquiry-dto'
import { mapInquiryDetail } from './map-inquiry'
import type { InquiryDetail } from '../model/inquiry'

export const getInquiryDetail = async (id: string): Promise<InquiryDetail> => {
  const { data } = await apiClient.get<InquiryDetailDto>(`/inquiries/${id}`)
  return mapInquiryDetail(data)
}
