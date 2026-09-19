import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import { SearchableSelect, fetchOptions, type SearchableOption } from '@/src/shared/ui/searchable-select'
import { Textarea } from '@/src/shared/ui/textarea'
import { useDebouncedValue } from '@/src/shared/hooks/use-debounced-value'
import { getCourseDetail, type Course } from '@/src/entities/institution'
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
import {
  getTraineeList,
  postTrainee,
  traineeQueries,
  type Trainee as TraineeEntity,
} from '@/src/entities/trainee'

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

const courseOptionsFetcher = fetchOptions('/courses', {}, c => ({
  value: c.id as string,
  label: c.name as string,
  hint: c.institution_name as string | undefined,
}))

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
  // 검색 결과가 없을 때 그 자리에서 교육생을 새로 만든다
  const [creatingTrainee, setCreatingTrainee] = useState(false)
  const [newTraineeBirth, setNewTraineeBirth] = useState('')
  const [newTraineePhone, setNewTraineePhone] = useState('')
  const [courseId, setCourseId] = useState<string>(MANUAL)
  const [courseName, setCourseName] = useState('')
  const [institutionName, setInstitutionName] = useState('')
  const [formNo, setFormNo] = useState('')
  const [docNo, setDocNo] = useState('')
  const [totalHours, setTotalHours] = useState('')
  const [completedHours, setCompletedHours] = useState('')
  const [source, setSource] = useState<TrainingSource>(defaultSource)
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus>('completed')
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [memo, setMemo] = useState('')

  const traineeDropdownRef = useRef<HTMLDivElement>(null)
  const debouncedTraineeSearch = useDebouncedValue(traineeSearch.trim(), 300)
  const [traineeDropdownOpen, setTraineeDropdownOpen] = useState(false)

  // 교육생 검색 — 클릭 시 펼침 + 무한 스크롤 (debounce 300ms)
  const traineeListQuery = useInfiniteQuery({
    queryKey: [...traineeQueries.lists(), { q: debouncedTraineeSearch, limit: 20 }],
    queryFn: ({ pageParam }) =>
      getTraineeList({ q: debouncedTraineeSearch || undefined, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: traineeDropdownOpen && !record && !trainee,
  })
  const traineeOptions = traineeListQuery.data?.pages.flatMap((p) => p.items) ?? []

  useEffect(() => {
    if (!traineeDropdownOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (!traineeDropdownRef.current?.contains(e.target as Node)) setTraineeDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [traineeDropdownOpen])

  // 검색 결과 없음 → 그 자리에서 생성하고 바로 선택. 교육생 관리와 같은 수기 등록 경로.
  const createTraineeMutation = useMutation({
    mutationFn: () =>
      postTrainee({
        name: traineeSearch.trim(),
        birth_date: newTraineeBirth || null,
        phone: newTraineePhone.trim() || undefined,
      }),
    onSuccess: (created) => {
      toast.success(`교육생을 등록했어요 — ${created.name}`)
      setTrainee(created)
      setCreatingTrainee(false)
      setTraineeQuery(null)
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // 열릴 때마다 폼 초기화 — record 있으면 수정값, 없으면 신규 기본값
  useEffect(() => {
    if (!isOpen) return
    setTraineeQuery(null)
    setTraineeSearch('')
    setCreatingTrainee(false)
    setNewTraineeBirth('')
    setNewTraineePhone('')
    if (record) {
      setTrainee(
        record.traineeId
          ? {
              id: record.traineeId,
              traineeNo: record.traineeNo ?? '',
              certNo: null,
              supervisorGrade: null,
              name: record.traineeName ?? '',
              birthDate: null,
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
      setFormNo(record.formNo ?? '')
      setDocNo(record.docNo ?? '')
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
      setFormNo('')
      setDocNo('')
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
  const handleCourseChange = (value: string | null, option?: SearchableOption) => {
    setCourseId(value ?? MANUAL)
    if (!value) return
    // 스냅샷 채움은 과정 상세 조회 후 — 라벨만으로는 시수를 모른다
    void option
    getCourseDetail(value).then((course) => {
      setCourseName(course.name)
      setInstitutionName(course.institutionName ?? '')
      setTotalHours(course.totalHours !== null ? String(course.totalHours) : '')
      setCompletedHours((prev) =>
        prev === '' && course.totalHours !== null ? String(course.totalHours) : prev,
      )
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        trainee_id: trainee!.id,
        course_id: courseId !== MANUAL ? courseId : null,
        course_name: courseName.trim(),
        institution_name: institutionName.trim() || undefined,
        form_no: formNo.trim() || null,
        doc_no: docNo.trim() || null,
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
              <div ref={traineeDropdownRef} className="relative">
                <Input
                  placeholder="클릭해서 성명으로 검색 · 선택"
                  value={traineeSearch}
                  onChange={(e) => {
                    setTraineeSearch(e.target.value)
                    setTraineeDropdownOpen(true)
                  }}
                  onFocus={() => setTraineeDropdownOpen(true)}
                />
                {traineeDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
                    <div
                      className="max-h-56 overflow-y-auto scrollbar-thin divide-y divide-line-2"
                      onScroll={(e) => {
                        const el = e.currentTarget
                        if (
                          traineeListQuery.hasNextPage &&
                          !traineeListQuery.isFetchingNextPage &&
                          el.scrollHeight - el.scrollTop - el.clientHeight < 40
                        ) {
                          traineeListQuery.fetchNextPage()
                        }
                      }}
                    >
                      {traineeListQuery.isPending ? (
                        <p className="px-3 py-2 text-[13px] text-ink-3">불러오는 중...</p>
                      ) : traineeOptions.length === 0 ? (
                        <div className="space-y-2 px-3 py-2">
                          <p className="text-[13px] text-ink-3">검색 결과가 없어요</p>
                          {!creatingTrainee && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setCreatingTrainee(true)}
                              disabled={!traineeSearch.trim()}
                            >
                              '{traineeSearch.trim()}' 신규 교육생으로 등록
                            </Button>
                          )}
                        </div>
                      ) : (
                        traineeOptions.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-[13px] hover:bg-panel-2"
                            onClick={() => {
                              setTrainee(t)
                              setTraineeQuery(null)
                              setTraineeDropdownOpen(false)
                            }}
                          >
                            <span className="font-medium text-ink">{t.name}</span>
                            <span className="ml-2 text-ink-3">
                              {t.traineeNo} · {t.phoneMasked}
                            </span>
                          </button>
                        ))
                      )}
                      {traineeListQuery.isFetchingNextPage && (
                        <p className="px-3 py-1.5 text-center text-[12px] text-ink-3">
                          불러오는 중…
                        </p>
                      )}
                    </div>
                    {/* 검색 결과 없음 → 그 자리에서 신규 생성 (기존 흐름 유지) */}
                    {traineeOptions.length === 0 && creatingTrainee && (
                      <div className="space-y-2 border-t border-line px-3 py-2">
                        <div className="grid grid-cols-3 gap-2">
                          <Input value={traineeSearch.trim()} disabled aria-label="성명" />
                          <Input
                            type="date"
                            value={newTraineeBirth}
                            onChange={(e) => setNewTraineeBirth(e.target.value)}
                            aria-label="생년월일"
                          />
                          <Input
                            placeholder="전화번호 (선택)"
                            value={newTraineePhone}
                            onChange={(e) => setNewTraineePhone(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={createTraineeMutation.isPending}
                            onClick={() => createTraineeMutation.mutate()}
                          >
                            {createTraineeMutation.isPending ? '생성 중...' : '생성 후 선택'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCreatingTrainee(false)}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
          )}
        </div>

        {/* 과정 — 마스터 연결 or 직접 입력 */}
        <div className="space-y-1.5">
          <Label>과정</Label>
          <SearchableSelect
            value={courseId === MANUAL ? null : courseId}
            onChange={handleCourseChange}
            fetchPage={courseOptionsFetcher}
            queryKeyPrefix={["options", "record-courses"]}
            placeholder="과정 검색 · 선택 (직접 입력은 아래)"
            selectedLabel={record?.courseName ?? undefined}
            clearable
          />
          <p className="text-[11px] text-ink-3">
            선택 해제 시 직접 입력 — 목록에 없는 교육은 직접 입력을 사용하세요
          </p>
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
            <Label>서식번호</Label>
            <Input
              placeholder="예: 제○○호 서식"
              value={formNo}
              onChange={(e) => setFormNo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>문서번호</Label>
            <Input
              placeholder="예: 대축-2026-001"
              value={docNo}
              onChange={(e) => setDocNo(e.target.value)}
            />
          </div>
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
            <Input type="date" value={endedAt} min={startedAt || undefined} onChange={(e) => setEndedAt(e.target.value)} />
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
