import { apiClient } from '@/src/shared/api'
import type { Trainee } from '../model/trainee'

interface TraineeDto {
  id: string
  trainee_no: string
  cert_no: string | null
  supervisor_grade: string | null
  name: string
  birth_date: string | null
  phone_masked?: string
  email: string | null
  review_status: Trainee['reviewStatus']
  membership_grade_id: string | null
  grade_name: string | null
  user_id: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

/** 감리원증번호가 중복인 교육생 — 개명 등으로 발생, 관리자가 직접 수정·삭제하는 데이터 */
export const getTraineeDuplicates = async (): Promise<Trainee[]> => {
  const { data } = await apiClient.get<TraineeDto[]>('/trainees/duplicates')
  return data.map((d) => ({
    id: d.id,
    traineeNo: d.trainee_no,
    certNo: d.cert_no,
    supervisorGrade: d.supervisor_grade,
    name: d.name,
    birthDate: d.birth_date,
    phoneMasked: d.phone_masked ?? '',
    email: d.email,
    reviewStatus: d.review_status,
    membershipGradeId: d.membership_grade_id,
    gradeName: d.grade_name,
    gradeExpiresAt: null,
    userId: d.user_id,
    memo: d.memo,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }))
}
