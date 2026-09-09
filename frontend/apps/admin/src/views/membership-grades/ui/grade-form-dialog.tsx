import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Textarea } from '@/src/shared/ui/textarea'
import {
  membershipGradeQueries,
  patchMembershipGrade,
  postMembershipGrade,
  type MembershipGrade,
} from '@/src/entities/trainee'

interface Props {
  isOpen: boolean
  onClose: () => void
  grade: MembershipGrade | null
}

export function GradeFormDialog({ isOpen, onClose, grade }: Props) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setCode(grade?.code ?? '')
    setName(grade?.name ?? '')
    setDescription(grade?.description ?? '')
    setSortOrder(grade ? String(grade.sortOrder) : '0')
    setIsActive(grade?.isActive ?? true)
  }, [isOpen, grade])

  const mutation = useMutation({
    mutationFn: async () => {
      if (grade) {
        return patchMembershipGrade(grade.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          sort_order: Number(sortOrder || 0),
          is_active: isActive,
        })
      }
      return postMembershipGrade({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        sort_order: Number(sortOrder || 0),
      })
    },
    onSuccess: () => {
      toast.success(grade ? '등급을 수정했어요' : '등급을 등록했어요')
      queryClient.invalidateQueries({ queryKey: membershipGradeQueries.all() })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={grade ? '회원등급 수정' : '회원등급 등록'}
      description="확인서 가격 규칙은 등급 × 발급유형으로 결정돼요"
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: grade ? '수정' : '등록',
          variant: 'primary',
          isLoading: mutation.isPending,
          isDisabled: !name.trim() || (!grade && !code.trim()),
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>코드</Label>
            <Input
              placeholder="예: regular"
              value={code}
              disabled={grade !== null}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>정렬순서</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>등급명</Label>
          <Input
            placeholder="예: 일반 / 연간 / 평생"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>설명</Label>
          <Textarea
            rows={2}
            placeholder="선택"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {grade && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent]"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            사용중 (해제하면 교육생 등급 변경·가격 규칙에서 제외돼요)
          </label>
        )}
      </div>
    </Dialog>
  )
}
