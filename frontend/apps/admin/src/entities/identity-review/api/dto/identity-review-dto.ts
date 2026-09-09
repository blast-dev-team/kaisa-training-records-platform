export interface IdentityReviewDto {
  id: string
  identity_verification_id: string
  user_id: string
  user_name: string
  trainee_id: string | null
  verified_name: string
  verified_phone_masked: string
  status: 'pending' | 'approved' | 'rejected' | 'manual_review'
  matched_by: string | null
  determined_grade_id: string | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
}
