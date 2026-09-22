import { apiClient } from '@/src/shared/api'
import type { TraineeDto } from './dto/trainee-dto'
import { mapTrainee } from './map-trainee'
import type { TraineeCreateInput, Trainee } from '../model/trainee'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_TRAINEES } from './trainee-mock'

/** 교육생 수기 등록 — 본인인증 없이 approved 상태로 생성 */
export const postTrainee = async (input: TraineeCreateInput): Promise<Trainee> => {
  if (USE_MOCK) {
    await mockDelay()
    const now = new Date().toISOString().slice(0, 19)
    const created: Trainee = {
      id: `tr-${Date.now().toString(36)}`,
      traineeNo: `TR-${now.slice(0, 10).replaceAll('-', '')}-NEW`,
      certNo: input.cert_no ?? null,
      supervisorGrade: input.supervisor_grade ?? null,
      name: input.name,
      birthDate: input.birth_date ?? null,
      phoneMasked: input.phone ? `${input.phone.slice(0, 3)}-****-${input.phone.slice(-4)}` : '',
      email: input.email ?? null,
      reviewStatus: 'approved',
      membershipGradeId: input.membership_grade_id ?? null,
      gradeName: null,
      gradeExpiresAt: null,
      userId: null,
      memo: input.memo ?? null,
      createdAt: now,
      updatedAt: now,
    }
    MOCK_TRAINEES.unshift(created)
    return { ...created }
  }
  const { data } = await apiClient.post<TraineeDto>('/trainees', input)
  return mapTrainee(data)
}
