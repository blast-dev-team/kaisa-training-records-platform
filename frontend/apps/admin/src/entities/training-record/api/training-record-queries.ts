import { queryOptions } from '@tanstack/react-query'
import { getTrainingRecordList } from './get-training-record-list'
import { getTrainingRecordDetail } from './get-training-record-detail'
import type { TrainingRecordListQuery } from './query/training-record-list-query'

export const trainingRecordQueries = {
  all: () => ['training-records'] as const,
  lists: () => [...trainingRecordQueries.all(), 'list'] as const,
  list: (query: TrainingRecordListQuery) =>
    queryOptions({
      queryKey: [...trainingRecordQueries.lists(), query],
      queryFn: () => getTrainingRecordList(query),
    }),
  details: () => [...trainingRecordQueries.all(), 'detail'] as const,
  detail: (recordId: string) =>
    queryOptions({
      queryKey: [...trainingRecordQueries.details(), recordId],
      queryFn: () => getTrainingRecordDetail(recordId),
    }),
}
