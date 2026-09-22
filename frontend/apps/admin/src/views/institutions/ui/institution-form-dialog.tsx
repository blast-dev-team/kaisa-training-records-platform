import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import {
  institutionQueries,
  patchInstitution,
  postInstitution,
  type Institution,
} from '@/src/entities/institution'

interface Props {
  isOpen: boolean
  onClose: () => void
  institution: Institution | null
}

export function InstitutionFormDialog({ isOpen, onClose, institution }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setName(institution?.name ?? '')
    setCode(institution?.institutionCode ?? '')
    setIsActive(institution?.isActive ?? true)
  }, [isOpen, institution])

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        name: name.trim(),
        institution_code: code.trim() || undefined,
        is_active: isActive,
      }
      return institution
        ? patchInstitution(institution.id, input)
        : postInstitution(input)
    },
    onSuccess: () => {
      toast.success(institution ? '기관을 수정했어요' : '기관을 등록했어요')
      queryClient.invalidateQueries({ queryKey: institutionQueries.all() })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={institution ? '기관 수정' : '기관 등록'}
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: institution ? '수정' : '등록',
          variant: 'primary',
          isLoading: mutation.isPending,
          isDisabled: !name.trim(),
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>기관명</Label>
          <Input
            placeholder="예: 한국감리협회"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>기관코드</Label>
          <Input
            placeholder="선택"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            className="size-4 accent-[--color-accent]"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          사용중 (해제하면 과정 등록에서 제외돼요)
        </label>
      </div>
    </Dialog>
  )
}
