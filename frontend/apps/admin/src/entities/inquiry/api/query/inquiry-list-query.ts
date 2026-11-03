export interface InquiryListQuery {
  status?: string
  category?: string
  /** member | guest */
  authorType?: string
  search?: string
  /** YYYY-MM-DD */
  dateFrom?: string
  dateTo?: string
  page: number
  limit: number
}
