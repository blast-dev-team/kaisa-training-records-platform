import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import {
  membershipGradeQueries,
  postTraineeBulkGrade,
  traineeQueries,
  type Trainee,
} from '@/src/entities/trainee'
import { yearsAgoYMD } from '@/src/shared/utils/format'

/** 연간 등급 코드 — BE PERIOD_GRADE_CODE 와 일치. 이 등급만 기간(만료일)이 있다 */
const PERIOD_GRADE_CODE = 'annual'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 일괄 변경 대상 — 선택한 교육생들 */
  trainees: Trainee[]
  /** 성공 후 선택 해제용 */
  onDone: () => void
}

/** 선택한 교육생들의 회원등급을 한 등급으로 바꾼다 — 사유(선택)는 건별 변경 이력에 남는다. */
export function BulkGradeDialog({ isOpen, onClose, trainees, onDone }: Props) {
  const queryClient = useQueryClient()
  const [gradeId, setGradeId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [reason, setReason] = useState('')

  const { data: grades } = useQuery(membershipGradeQueries.list(true))
  const selectedGrade = (grades ?? []).find((g) => g.id === gradeId)
  const isAnnual = selectedGrade?.code === PERIOD_GRADE_CODE

  useEffect(() => {
    if (isOpen) {
      setGradeId('')
      setExpiresAt(yearsAgoYMD(-1))
      setReason('')
    }
  }, [isOpen])

  const mutation = useMutation({
    mutationFn: () =>
      postTraineeBulkGrade({
        trainee_ids: trainees.map((t) => t.id),
        membership_grade_id: gradeId,
        grade_expires_at: isAnnual ? expiresAt || undefined : undefined,
        grade_change_reason: reason.trim() || undefined,
      }),
    onSuccess: ({ updated, skipped }) => {
      toast.success(`등급을 변경했어요 — ${updated}명${skipped ? ` (제외 ${skipped}명)` : ''}`)
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() })
      onDone()
      onClose()
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
  })

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="회원등급 일괄 변경"
      description={`${trainees.length}명의 회원등급을 같은 등급으로 변경해요 — 건별로 변경 이력이 남아요`}
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: `${trainees.length}명 변경`,
          variant: 'primary',
          isLoading: mutation.isPending,
          isDisabled: !gradeId || (isAnnual && !expiresAt),
          onClick: () => {
            if (!gradeId) return
            mutation.mutate()
          },
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>변경할 등급 <span className="text-danger">*</span></Label>
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            <option value="">등급 선택</option>
            {(grades ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        {isAnnual && (
          <div className="space-y-1.5">
            <Label>만료일 <span className="text-danger">*</span></Label>
            <DateField ariaLabel="만료일" value={expiresAt} onChange={setExpiresAt} />
            <p className="text-12 text-ink-3">
              전원에 같은 만료일이 적용돼요 — 만료일이 지나면 자동으로 일반 등급으로 바뀌어요
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>변경 사유</Label>
          <Input
            placeholder="선택 — 변경 이력에 남아요 (예: 2026년 연회비 납부)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {trainees[0] && (
          <p className="text-12 text-ink-3">
            적용 대상: {trainees[0].name}
            {trainees.length > 1 ? ` 외 ${trainees.length - 1}명` : ''}
          </p>
        )}
      </div>
    </Dialog>
  )
}
