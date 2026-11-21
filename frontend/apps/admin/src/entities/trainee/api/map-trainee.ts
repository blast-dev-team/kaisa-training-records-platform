import type { TraineeDto, MembershipGradeDto } from './dto/trainee-dto'
import type { Trainee, MembershipGrade } from '../model/trainee'

export function mapTrainee(dto: TraineeDto): Trainee {
  return {
    id: dto.id,
    traineeNo: dto.trainee_no,
    certNo: dto.cert_no,
    supervisorGrade: dto.supervisor_grade,
    seniorCertNo: dto.senior_cert_no,
    seniorCertIssuedDate: dto.senior_cert_issued_date,
    certIssuedDate: dto.cert_issued_date ?? null,
    name: dto.name,
    birthDate: dto.birth_date,
    phoneMasked: dto.phone_masked,
    email: dto.email,
    reviewStatus: dto.review_status,
    membershipGradeId: dto.membership_grade_id,
    gradeName: dto.grade_name,
    gradeExpiresAt: dto.grade_expires_at,
    userId: dto.user_id,
    memo: dto.memo,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    internalHours: dto.internal_hours != null ? Number(dto.internal_hours) : null,
    externalHours: dto.external_hours != null ? Number(dto.external_hours) : null,
  }
}

export function mapMembershipGrade(dto: MembershipGradeDto): MembershipGrade {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    description: dto.description,
    sortOrder: dto.sort_order,
    priceKrw: dto.price_krw,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  }
}
