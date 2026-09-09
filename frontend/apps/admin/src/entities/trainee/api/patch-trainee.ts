import { apiClient } from '@/src/shared/api'
import type { TraineeDto } from './dto/trainee-dto'
import { mapTrainee } from './map-trainee'
import type { TraineeUpdateInput, Trainee } from '../model/trainee'

/** 교육생 정보 수정·등급 변경. review_status는 이 API로 바꾸지 않는다(본인인증 심사 전용). */
export const patchTrainee = async (
  traineeId: string,
  input: TraineeUpdateInput,
): Promise<Trainee> => {
  const { data } = await apiClient.patch<TraineeDto>(`/trainees/${traineeId}`, input)
  return mapTrainee(data)
}
