export interface CertificateListQuery {
  traineeId?: string
  status?: string
  page?: number
  limit?: number
}

export interface PricingRuleListQuery {
  membershipGradeId?: string
  issueType?: string
  isActive?: boolean
  page?: number
  limit?: number
}
