export interface TraineeDto {
  id: string
  trainee_no: string
  cert_no: string | null
  supervisor_grade: string | null
  name: string
  birth_date: string | null
  phone_masked: string
  email: string | null
  review_status: 'unverified' | 'pending' | 'approved' | 'rejected'
  membership_grade_id: string | null
  grade_name: string | null
  grade_expires_at: string | null
  user_id: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface MembershipGradeDto {
  id: string
  code: string
  name: string
  description: string | null
  sort_order: number
  price_krw: number
  is_active: boolean
  created_at: string
}
