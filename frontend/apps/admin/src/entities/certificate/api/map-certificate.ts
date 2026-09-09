import type { CertificateDto, PricingRuleDto } from './dto/certificate-dto'
import type { Certificate, PricingRule } from '../model/certificate'

export function mapCertificate(dto: CertificateDto): Certificate {
  return {
    id: dto.id,
    certificateNo: dto.certificate_no,
    certificateRequestId: dto.certificate_request_id,
    traineeId: dto.trainee_id,
    trainingRecordId: dto.training_record_id,
    paymentOrderId: dto.payment_order_id,
    issuedName: dto.issued_name,
    courseName: dto.course_name,
    institutionName: dto.institution_name,
    totalHours: dto.total_hours,
    completedHours: dto.completed_hours,
    trainingStartedAt: dto.training_started_at,
    trainingEndedAt: dto.training_ended_at,
    issuedAt: dto.issued_at,
    expiresAt: dto.expires_at,
    status: dto.status,
    revokedAt: dto.revoked_at,
    revokedReason: dto.revoked_reason,
  }
}

export function mapPricingRule(dto: PricingRuleDto): PricingRule {
  return {
    id: dto.id,
    membershipGradeId: dto.membership_grade_id,
    issueType: dto.issue_type,
    priceKrw: dto.price_krw,
    currency: dto.currency,
    validFrom: dto.valid_from,
    validTo: dto.valid_to,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  }
}
