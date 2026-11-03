export interface InquiryListItemDto {
  id: string
  category: string
  title: string
  status: 'open' | 'answered'
  author_name: string
  is_member: boolean
  answered_by_name: string | null
  answered_at: string | null
  created_at: string
}

export interface InquiryHistoryItemDto extends InquiryListItemDto {
  content: string
  answer: string | null
  matched_by: 'account' | 'name_phone'
}

export interface InquiryDetailDto extends InquiryListItemDto {
  content: string
  answer: string | null
  author_phone: string | null
  author_cert_no: string | null
  author_email: string | null
  trainee_id: string | null
  trainee_no: string | null
  updated_at: string
  history: InquiryHistoryItemDto[]
}
