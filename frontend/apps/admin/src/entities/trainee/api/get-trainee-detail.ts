import { apiClient } from '@/src/shared/api'
import type { TraineeDto } from './dto/trainee-dto'
import { mapTrainee } from './map-trainee'
import type { Trainee } from '../model/trainee'

export const getTraineeDetail = async (traineeId: string): Promise<Trainee> => {
  const { data } = await apiClient.get<TraineeDto>(`/trainees/${traineeId}`)
  return mapTrainee(data)
}
