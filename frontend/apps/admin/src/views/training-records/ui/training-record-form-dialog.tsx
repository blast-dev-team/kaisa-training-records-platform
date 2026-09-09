import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import { Textarea } from '@/src/shared/ui/textarea'
import { courseQueries } from '@/src/entities/institution'
import {
  patchTrainingRecord,
  postTrainingRecord,
  trainingRecordQueries,
  COMPLETION_STATUS_LABELS,
  TRAINING_SOURCE_LABELS,
  type CompletionStatus,
  type TrainingRecord,
  type TrainingSource,
} from '@/src/entities/training-record'
import { traineeQueries, type Trainee as TraineeEntity } from '@/src/entities/trainee'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 수정 대상 — null이면 신규 등록 */
  record: TrainingRecord | null
  /** 외부 수료 뷰에서는 'external' 고정 */
  defaultSource: TrainingSource
  /** 딥링크 등록 — 교육생 미리 선택 */
  presetTrainee?: TraineeEntity | null
}

const MANUAL = '__manual__'

export function TrainingRecordFormDialog({
  isOpen,
  onClose,
  record,
  defaultSource,
  presetTrainee,
}: Props) {
  const queryClient = useQueryClient()

  const [trainee, setTrainee] = useState<TraineeEntity | null>(null)
  const [traineeSearch, setTraineeSearch] = useState('')
  const [traineeQuery, setTraineeQuery] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string>(MANUAL)
  const [courseName, setCourseName] = useState('')
  const [institutionName, setInstitutionName] = useState('')
  const [totalHours, setTotalHours] = useState('')
  const [completedHours, setCompletedHours] = useState('')
  const [source, setSource] = useState<TrainingSource>(defaultSource)
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus>('completed')
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [memo, setMemo] = useState('')

  const { data: courses } = useQuery(courseQueries.list({ isActive: true }))
  const { data: traineeResults, isFetching: searchingTrainee } = useQuery({
    ...traineeQueries.list({ q: traineeQuery ?? '', page: 1, limit: 10 }),
    enabled: traineeQuery !== null,
  })

  // 열릴 때마다 폼 초기화 — record 있으면 수정값, 없으면 신규 기본값
  useEffect(() => {
    if (!isOpen) return
    setTraineeQuery(null)
    setTraineeSearch('')
    if (record) {
      setTrainee(
        record.traineeId
          ? {
              id: record.traineeId,
              traineeNo: record.traineeNo ?? '',
              name: record.traineeName ?? '',
              phoneMasked: '',
              email: null,
              reviewStatus: 'approved',
              membershipGradeId: null,
              gradeName: null,
              userId: null,
              memo: null,
              createdAt: '',
              updatedAt: '',
            }
          : null,
      )
      setCourseId(record.courseId ?? MANUAL)
      setCourseName(record.courseName)
      setInstitutionName(record.institutionName ?? '')
      setTotalHours(record.totalHours !== null ? String(record.totalHours) : '')
      setCompletedHours(record.completedHours !== null ? String(record.completedHours) : '')
      setSource(record.source)
      setCompletionStatus(record.completionStatus)
      setStartedAt(record.startedAt ?? '')
      setEndedAt(record.endedAt ?? '')
      setMemo(record.memo ?? '')
    } else {
      setTrainee(presetTrainee ?? null)
      setCourseId(MANUAL)
      setCourseName('')
      setInstitutionName('')
      setTotalHours('')
      setCompletedHours('')
      setSource(defaultSource)
      setCompletionStatus('completed')
      setStartedAt('')
      setEndedAt('')
      setMemo('')
    }
  }, [isOpen, record, presetTrainee, defaultSource])

  // 과정 마스터 선택 → 과정명·기관명·총시수 스냅샷 자동 채움
  const handleCourseChange = (value: string) => {
    setCourseId(value)
    if (value === MANUAL) return
    const course = courses?.find((c) => c.id === value)
    if (course) {
      setCourseName(course.name)
      setInstitutionName(course.institutionName ?? '')
      setTotalHours(course.totalHours !== null ? String(course.totalHours) : '')
      if (completedHours === '') setCompletedHours(course.totalHours !== null ? String(course.totalHours) : '')
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        trainee_id: trainee!.id,
        course_id: courseId !== MANUAL ? courseId : null,
        course_name: courseName.trim(),
        institution_name: institutionName.trim() || undefined,
        total_hours: totalHours === '' ? null : Number(totalHours),
        completed_hours: completedHours === '' ? null : Number(completedHours),
        started_at: startedAt || null,
        ended_at: endedAt || null,
        source,
        completion_status: completionStatus,
        memo: memo.trim() || null,
      }
      if (record) return patchTrainingRecord(record.id, input)
      return postTrainingRecord(input)
    },
    onSuccess: () => {
      toast.success(record ? '이력을 수정했어요' : '이력을 등록했어요')
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const canSubmit = useMemo(
    () => !!trainee && courseName.trim().length > 0 && !mutation.isPending,
    [trainee, courseName, mutation.isPending],
  )

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={record ? '교육이력 수정' : '교육이력 등록'}
      description={
        record
          ? `${record.traineeNo ?? ''} ${record.traineeName ?? ''}`
          : '과정을 선택하면 과정명·기관·시수가 자동으로 채워져요'
      }
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: record ? '수정' : '등록',
          variant: 'primary',
          isLoading: mutation.isPending,
          isDisabled: !canSubmit,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        {/* 교육생 — 수정 시 고정 */}
        <div className="space-y-1.5">
          <Label>교육생</Label>
          {record ? (
            <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink">
              {trainee?.traineeNo} {trainee?.name}
            </p>
          ) : trainee ? (
            <div className="flex items-center justify-between rounded-md border border-accent-soft bg-accent-soft px-3 py-2">
              <span className="text-[13px] text-accent-ink">
                {trainee.traineeNo} · {trainee.name} · {trainee.phoneMasked}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setTrainee(null)}>
                변경
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="성명으로 검색"
                  value={traineeSearch}
                  onChange={(e) => setTraineeSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setTraineeQuery(traineeSearch.trim() || null)
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setTraineeQuery(traineeSearch.trim() || null)}
                >
                  검색
                </Button>
              </div>
              {traineeQuery !== null && (
                <div className="max-h-40 overflow-y-auto scrollbar-thin rounded-md border border-line divide-y divide-line-2">
                  {searchingTrainee ? (
                    <p className="px-3 py-2 text-[13px] text-ink-3">검색 중...</p>
                  ) : (traineeResults?.items ?? []).length === 0 ? (
                    <p className="px-3 py-2 text-[13px] text-ink-3">검색 결과가 없어요</p>
                  ) : (
                    (traineeResults?.items ?? []).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-[13px] hover:bg-panel-2"
                        onClick={() => {
                          setTrainee(t)
                          setTraineeQuery(null)
                        }}
                      >
                        <span className="font-medium text-ink">{t.name}</span>
                        <span className="ml-2 text-ink-3">
                          {t.traineeNo} · {t.phoneMasked}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 과정 — 마스터 연결 or 직접 입력 */}
        <div className="space-y-1.5">
          <Label>과정</Label>
          <Select value={courseId} onChange={(e) => handleCourseChange(e.target.value)}>
            <option value={MANUAL}>직접 입력</option>
            {(courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.institutionName ? `· ${c.institutionName}` : ''}
              </option>
            ))}
          </Select>
          {courseId === MANUAL && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Input
                placeholder="과정명"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
              />
              <Input
                placeholder="기관명"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>구분</Label>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as TrainingSource)}
            >
              {Object.entries(TRAINING_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>수료상태</Label>
            <Select
              value={completionStatus}
              onChange={(e) => setCompletionStatus(e.target.value as CompletionStatus)}
            >
              {Object.entries(COMPLETION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>시작일</Label>
            <Input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>종료일</Label>
            <Input type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>총 시수</Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 8"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>이수 시수</Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 8"
              value={completedHours}
              onChange={(e) => setCompletedHours(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>메모</Label>
          <Textarea
            rows={2}
            placeholder="참고 사항"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  )
}
