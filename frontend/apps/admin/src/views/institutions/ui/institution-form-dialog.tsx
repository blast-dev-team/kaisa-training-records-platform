import { toUserMessage } from '@/src/shared/lib/friendly-error';
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import {
  institutionQueries,
  patchInstitution,
  postInstitution,
  type Institution,
  type InstitutionType,
} from '@/src/entities/institution'

const TYPE_LABEL: Record<string, string> = { internal: '사내', external: '외부' }

interface Props {
  isOpen: boolean
  onClose: () => void
  institution: Institution | null
}

export function InstitutionFormDialog({ isOpen, onClose, institution }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [institutionType, setInstitutionType] = useState<InstitutionType>("external")
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setName(institution?.name ?? '')
    setCode(institution?.institutionCode ?? '')
    setInstitutionType(institution?.institutionType ?? "external")
    setIsActive(institution?.isActive ?? true)
  }, [isOpen, institution])

  // 수정 중에 구분을 실제로 바꾼 경우 — 기존 내역에 소급되니 저장 전에 한 번 더 눈에 띄게 알린다
  const typeChange =
    institution && institution.institutionType !== institutionType
      ? `${TYPE_LABEL[institution.institutionType ?? ''] ?? '미선택'} → ${TYPE_LABEL[institutionType ?? ''] ?? '미선택'}`
      : null

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        name: name.trim(),
        // 수정에서 코드를 지우면 null 로 지운다 — undefined 는 키가 빠져 기존 코드가 남았다
        institution_code: code.trim() || (institution ? null : undefined),
        // 구분은 항상 보낸다 — '미선택' 으로 되돌리려면 null 을 명시해야 해서
        institution_type: institutionType,
        is_active: isActive,
      }
      return institution
        ? patchInstitution(institution.id, input)
        : postInstitution(input)
    },
    onSuccess: () => {
      toast.success(institution ? '기관을 수정했어요' : '기관을 등록했어요')
      queryClient.invalidateQueries({ queryKey: institutionQueries.all() })
      // 기관명·구분 변경은 서버가 연결된 이력·일정·과정에 반영한다 — 연관 목록도 새로 읽는다
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      queryClient.invalidateQueries({ queryKey: ['course-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['training-records'] })
      onClose()
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
  })

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={institution ? '기관 수정' : '기관 등록'}
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: institution ? (typeChange ? '구분 바꾸고 수정' : '수정') : '등록',
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
        <div className="space-y-1.5">
          <Label>구분</Label>
          <Select
            value={institutionType ?? ''}
            onChange={(e) =>
              setInstitutionType(
                (e.target.value || null) as InstitutionType,
              )
            }
          >
            <option value="internal">사내</option>
            <option value="external">외부</option>
          </Select>
          <p className="text-12 text-ink-3">
            사내 기관의 수료내역만 수료증 발급이 가능해요
          </p>
          <div className="space-y-1 rounded-md bg-warn-soft px-3 py-2 text-12 text-warn-ink">
            <p className="font-medium">
              구분을 바꾸면 이 기관의 기존 수료내역에도 소급 적용돼요
            </p>
            <p>
              사내 → 외부: 기존 내역이 외부교육 16시간(최근 3년) 한도에 합쳐져요 — 초과해도
              기존 내역은 유지되고 이후 외부교육 등록만 제한돼요
            </p>
            <p>외부 → 사내: 기존 내역이 외부 한도 집계에서 빠져나가요</p>
            <p>
              교육 내역의 구분, 감리원 목록의 사내·외부 교육시간, 확인서 합계도 저장 즉시 바뀌어요
            </p>
          </div>
          {typeChange && (
            <p className="rounded-md border border-warn px-3 py-2 text-12 font-semibold text-warn-ink">
              구분 변경: {typeChange} — 이 기관의 기존 교육 내역 전체에 적용돼요
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-13 text-ink-2">
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
