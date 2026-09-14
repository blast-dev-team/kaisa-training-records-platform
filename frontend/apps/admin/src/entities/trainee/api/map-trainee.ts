import type { TraineeDto, MembershipGradeDto } from './dto/trainee-dto'
import type { Trainee, MembershipGrade } from '../model/trainee'

export function mapTrainee(dto: TraineeDto): Trainee {
  return {
    id: dto.id,
    traineeNo: dto.trainee_no,
    name: dto.name,
    phoneMasked: dto.phone_masked,
    email: dto.email,
    reviewStatus: dto.review_status,
    membershipGradeId: dto.membership_grade_id,
    gradeName: dto.grade_name,
    userId: dto.user_id,
    memo: dto.memo,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  }
}

export function mapMembershipGrade(dto: MembershipGradeDto): MembershipGrade {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    description: dto.description,
    sortOrder: dto.sort_order,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  }
}
