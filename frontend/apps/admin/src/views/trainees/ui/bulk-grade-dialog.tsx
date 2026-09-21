import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import {
  membershipGradeQueries,
  postTraineeBulkGrade,
  traineeQueries,
  type Trainee,
} from '@/src/entities/trainee'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 일괄 변경 대상 — 선택한 교육생들 */
  trainees: Trainee[]
  /** 성공 후 선택 해제용 */
  onDone: () => void
}

/** 선택한 교육생들의 회원등급을 한 등급으로 바꾼다 — 사유 없이 바로 변경(이력 사유 null). */
export function BulkGradeDialog({ isOpen, onClose, trainees, onDone }: Props) {
  const queryClient = useQueryClient()
  const [gradeId, setGradeId] = useState('')

  const { data: grades } = useQuery(membershipGradeQueries.list(true))

  useEffect(() => {
    if (isOpen) setGradeId('')
  }, [isOpen])

  const mutation = useMutation({
    mutationFn: () =>
      postTraineeBulkGrade({
        trainee_ids: trainees.map((t) => t.id),
        membership_grade_id: gradeId,
      }),
    onSuccess: ({ updated, skipped }) => {
      toast.success(`등급을 변경했어요 — ${updated}명${skipped ? ` (제외 ${skipped}명)` : ''}`)
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() })
      onDone()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
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
          isDisabled: !gradeId,
          onClick: () => {
            if (!gradeId) return
            mutation.mutate()
          },
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>변경할 등급</Label>
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            <option value="">등급 선택</option>
            {(grades ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        {trainees[0] && (
          <p className="text-[12px] text-ink-3">
            적용 대상: {trainees[0].name}
            {trainees.length > 1 ? ` 외 ${trainees.length - 1}명` : ''}
          </p>
        )}
      </div>
    </Dialog>
  )
}
