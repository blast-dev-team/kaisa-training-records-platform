/** 문의함 — 백엔드 InquiryAdminListItem / InquiryAdminDetail 과 1:1 */

export type InquiryStatus = 'open' | 'answered'
export type InquiryCategory =
  | 'training_record'
  | 'certificate'
  | 'payment'
  | 'auth'
  | 'verification'
  | 'etc'

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  open: '미해결',
  answered: '답변완료',
}

export const INQUIRY_CATEGORY_LABELS: Record<InquiryCategory, string> = {
  training_record: '교육내역(누락·정정)',
  certificate: '확인서 발급',
  payment: '결제·환불',
  auth: '본인인증·로그인',
  verification: '진위확인',
  etc: '기타',
}

export const inquiryCategoryLabel = (value: string) =>
  INQUIRY_CATEGORY_LABELS[value as InquiryCategory] ?? '기타'

export interface InquiryListItem {
  id: string
  category: string
  title: string
  status: InquiryStatus
  authorName: string
  isMember: boolean
  answeredByName: string | null
  answeredAt: string | null
  createdAt: string
}

export interface InquiryHistoryItem extends InquiryListItem {
  content: string
  answer: string | null
  /** account = 같은 회원 계정(본인 확인됨) · name_phone = 성명+연락처만 일치(본인확인 안 됨) */
  matchedBy: 'account' | 'name_phone'
}

export interface InquiryDetail extends InquiryListItem {
  content: string
  answer: string | null
  authorPhone: string | null
  authorCertNo: string | null
  authorEmail: string | null
  traineeId: string | null
  traineeNo: string | null
  updatedAt: string
  /** 같은 문의자(회원 계정 또는 성명+연락처 일치)의 다른 문의 — 최신순 */
  history: InquiryHistoryItem[]
}
