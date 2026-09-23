export * from './model/training-record'
export { trainingRecordQueries } from './api/training-record-queries'
export { getTrainingRecordList } from './api/get-training-record-list'
export { getTrainingRecordDetail } from './api/get-training-record-detail'
export { postTrainingRecord } from './api/post-training-record'
export { postTrainingRecordBulk } from './api/post-training-record-bulk'
export { postTrainingRecordMatchPreview } from './api/post-training-record-match-preview'
export type {
  MatchPreviewMatched,
  MatchPreviewUnmatched,
  TraineeMatchPreviewResult,
} from './api/post-training-record-match-preview'
export { patchTrainingRecord } from './api/patch-training-record'
export { patchTrainingRecordBulk } from './api/patch-training-record-bulk'
export type { TrainingRecordBulkUpdateItem } from './api/patch-training-record-bulk'
export { deleteTrainingRecord } from './api/delete-training-record'
export { deleteTrainingRecordBulk } from './api/delete-training-record-bulk'
export type { TrainingRecordListQuery } from './api/query/training-record-list-query'
export { postCompletionCertificatesIssue } from './api/post-completion-certificates-issue'
