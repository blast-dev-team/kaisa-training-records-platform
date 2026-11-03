import type { InquiryDetailDto, InquiryHistoryItemDto, InquiryListItemDto } from './dto/inquiry-dto'
import type { InquiryDetail, InquiryHistoryItem, InquiryListItem } from '../model/inquiry'

export const mapInquiryListItem = (dto: InquiryListItemDto): InquiryListItem => ({
  id: dto.id,
  category: dto.category,
  title: dto.title,
  status: dto.status,
  authorName: dto.author_name,
  isMember: dto.is_member,
  answeredByName: dto.answered_by_name,
  answeredAt: dto.answered_at,
  createdAt: dto.created_at,
})

const mapHistoryItem = (dto: InquiryHistoryItemDto): InquiryHistoryItem => ({
  ...mapInquiryListItem(dto),
  content: dto.content,
  answer: dto.answer,
  matchedBy: dto.matched_by,
})

export const mapInquiryDetail = (dto: InquiryDetailDto): InquiryDetail => ({
  ...mapInquiryListItem(dto),
  content: dto.content,
  answer: dto.answer,
  authorPhone: dto.author_phone,
  authorCertNo: dto.author_cert_no,
  authorEmail: dto.author_email,
  traineeId: dto.trainee_id,
  traineeNo: dto.trainee_no,
  updatedAt: dto.updated_at,
  history: dto.history.map(mapHistoryItem),
})
