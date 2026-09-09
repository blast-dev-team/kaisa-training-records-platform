import { queryOptions } from '@tanstack/react-query'
import { getTraineeList } from './get-trainee-list'
import { getTraineeDetail } from './get-trainee-detail'
import { getMembershipGradeList } from './get-membership-grade-list'
import type { TraineeListQuery } from './query/trainee-list-query'

export const traineeQueries = {
  all: () => ['trainees'] as const,
  lists: () => [...traineeQueries.all(), 'list'] as const,
  list: (query: TraineeListQuery) =>
    queryOptions({
      queryKey: [...traineeQueries.lists(), query],
      queryFn: () => getTraineeList(query),
    }),
  details: () => [...traineeQueries.all(), 'detail'] as const,
  detail: (traineeId: string) =>
    queryOptions({
      queryKey: [...traineeQueries.details(), traineeId],
      queryFn: () => getTraineeDetail(traineeId),
    }),
}

export const membershipGradeQueries = {
  all: () => ['membership-grades'] as const,
  lists: () => [...membershipGradeQueries.all(), 'list'] as const,
  list: (isActive?: boolean) =>
    queryOptions({
      queryKey: [...membershipGradeQueries.lists(), { isActive }],
      queryFn: () => getMembershipGradeList(isActive),
      staleTime: 5 * 60 * 1000,
    }),
}
