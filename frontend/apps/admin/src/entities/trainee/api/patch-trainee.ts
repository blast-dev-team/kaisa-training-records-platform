import { apiClient } from '@/src/shared/api'
import type { TraineeDto } from './dto/trainee-dto'
import { mapTrainee } from './map-trainee'
import type { TraineeUpdateInput, Trainee } from '../model/trainee'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { findTrainee, MOCK_GRADES } from './trainee-mock'

/** 교육생 정보 수정·등급 변경. review_status는 이 API로 바꾸지 않는다(본인인증 심사 전용). */
export const patchTrainee = async (
  traineeId: string,
  input: TraineeUpdateInput,
): Promise<Trainee> => {
  if (USE_MOCK) {
    await mockDelay()
    const trainee = findTrainee(traineeId)
    if (!trainee) throw new Error('교육생을 찾을 수 없어요')
    if (input.name !== undefined) trainee.name = input.name
    if (input.email !== undefined) trainee.email = input.email
    if (input.memo !== undefined) trainee.memo = input.memo
    if (input.membership_grade_id !== undefined) {
      trainee.membershipGradeId = input.membership_grade_id
      trainee.gradeName =
        MOCK_GRADES.find(g => g.id === input.membership_grade_id)?.name ?? trainee.gradeName
    }
    trainee.updatedAt = new Date().toISOString().slice(0, 19)
    return { ...trainee }
  }
  const { data } = await apiClient.patch<TraineeDto>(`/trainees/${traineeId}`, input)
  return mapTrainee(data)
}
