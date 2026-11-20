import type { CertificateDto } from './dto/certificate-dto'
import type { Certificate } from '../model/certificate'

export function mapCertificate(dto: CertificateDto): Certificate {
  return {
    id: dto.id,
    certificateNo: dto.certificate_no,
    bundleNo: dto.bundle_no,
    certificateRequestId: dto.certificate_request_id,
    traineeId: dto.trainee_id,
    trainingRecordId: dto.training_record_id,
    paymentOrderId: dto.payment_order_id,
    issuedName: dto.issued_name,
    courseName: dto.course_name,
    institutionName: dto.institution_name,
    totalHours: dto.total_hours != null ? Number(dto.total_hours) : null,
    completedHours: dto.completed_hours != null ? Number(dto.completed_hours) : null,
    trainingStartedAt: dto.training_started_at,
    trainingEndedAt: dto.training_ended_at,
    issuedAt: dto.issued_at,
    downloadedAt: dto.downloaded_at,
    downloadCount: dto.download_count != null ? Number(dto.download_count) : 0,
    expiresAt: dto.expires_at,
    status: dto.status,
    issueSource: dto.issue_source ?? 'member',
    revokedAt: dto.revoked_at,
    revokedReason: dto.revoked_reason,
    // BE 는 묶음에 포함된 교육내역 수를 record_count 로 보낸다
    memberCount: dto.record_count != null ? Number(dto.record_count) : 1,
  }
}

