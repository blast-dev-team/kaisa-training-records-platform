import { queryOptions } from '@tanstack/react-query'
import { getTrainingRecordList } from './get-training-record-list'
import { getTrainingRecordDetail } from './get-training-record-detail'
import { getExternalHours } from './get-external-hours'
import type { TrainingRecordListQuery } from './query/training-record-list-query'

export const trainingRecordQueries = {
  all: () => ['training-records'] as const,
  lists: () => [...trainingRecordQueries.all(), 'list'] as const,
  list: (query: TrainingRecordListQuery) =>
    queryOptions({
      queryKey: [...trainingRecordQueries.lists(), query],
      queryFn: () => getTrainingRecordList(query),
      placeholderData: (prev) => prev,
    }),
  details: () => [...trainingRecordQueries.all(), 'detail'] as const,
  detail: (recordId: string) =>
    queryOptions({
      queryKey: [...trainingRecordQueries.details(), recordId],
      queryFn: () => getTrainingRecordDetail(recordId),
    }),
  /** 감리원 최근 3년 외부교육 합계 — 등록 모달 한도 안내. 등록 직전 값이어야 해서 매번 새로 받는다 */
  externalHours: (traineeId: string | null, excludeRecordId?: string | null) =>
    queryOptions({
      queryKey: [...trainingRecordQueries.all(), 'external-hours', traineeId, excludeRecordId ?? null],
      queryFn: () => getExternalHours(traineeId!, excludeRecordId),
      enabled: !!traineeId,
      staleTime: 0,
    }),
}
