import { apiClient } from "@/src/shared/api";
import type { TraineeDto } from "./dto/trainee-dto";
import { mapTrainee } from "./map-trainee";
import type { Trainee } from "../model/trainee";
import { USE_MOCK, mockDelay } from "@/src/shared/api/mock";
import { findTrainee } from "./trainee-mock";

export const getTraineeDetail = async (traineeId: string): Promise<Trainee> => {
  if (USE_MOCK) {
    await mockDelay();
    const found = findTrainee(traineeId);
    if (!found) throw new Error("감리원을 찾을 수 없어요");
    return { ...found };
  }
  const { data } = await apiClient.get<TraineeDto>(`/trainees/${traineeId}`);
  return mapTrainee(data);
};
