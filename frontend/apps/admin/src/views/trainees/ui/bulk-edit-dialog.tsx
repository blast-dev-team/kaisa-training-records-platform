import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import {
  postTraineeBulkUpdate,
  traineeQueries,
  type Trainee,
  type TraineeBulkUpdateItem,
} from '@/src/entities/trainee'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 일괄 수정 대상 — 선택한 교육생들 */
  trainees: Trainee[]
  /** 성공 후 선택 해제용 */
  onDone: () => void
}

/** 모달 안에서 교육생마다 한 줄로 값을 고치고 한 번에 저장한다 */
interface RowDraft {
  name: string
  birthDate: string
  phone: string
}

export function BulkEditDialog({ isOpen, onClose, trainees, onDone }: Props) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Record<string, RowDraft>>({})

  useEffect(() => {
    if (!isOpen) return
    const seeded: Record<string, RowDraft> = {}
    for (const t of trainees) {
      seeded[t.id] = { name: t.name, birthDate: t.birthDate ?? '', phone: '' }
    }
    setRows(seeded)
    // 열릴 때의 선택 목록을 그대로 시드 — 이후 trainees 참조 변화는 무시한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const setRow = (id: string, patch: Partial<RowDraft>) => {
    setRows((prev) => {
      const base = prev[id] ?? { name: '', birthDate: '', phone: '' }
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  // 전화는 빈 값 = 기존 유지 — null 을 보내면 초기화되므로 키를 생략한다
  const items: TraineeBulkUpdateItem[] = trainees.map((t) => {
    const row = rows[t.id]
    const item: TraineeBulkUpdateItem = { id: t.id, name: row?.name.trim() ?? t.name }
    if (row?.birthDate) item.birth_date = row.birthDate
    if (row?.phone.trim()) item.phone = row.phone.trim()
    return item
  })

  const nameEmpty = trainees.some((t) => !rows[t.id]?.name.trim())

  const mutation = useMutation({
    mutationFn: () => postTraineeBulkUpdate({ items }),
    onSuccess: ({ updated, skipped }) => {
      toast.success(`정보를 수정했어요 — ${updated}명${skipped ? ` (제외 ${skipped}명)` : ''}`)
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
      size="xl"
      title="교육생 정보 일괄 수정"
      description={`${trainees.length}명의 성명·생년월일·전화번호를 개별로 수정해요`}
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: `${trainees.length}명 저장`,
          variant: 'primary',
          isLoading: mutation.isPending,
          isDisabled: nameEmpty,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[110px_1fr_150px_170px] items-center gap-2 px-0.5">
          <Label className="text-[11px] text-ink-3">교육생번호</Label>
          <Label className="text-[11px] text-ink-3">성명</Label>
          <Label className="text-[11px] text-ink-3">생년월일</Label>
          <Label className="text-[11px] text-ink-3">전화번호</Label>
        </div>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {trainees.map((t) => {
            const row = rows[t.id]
            if (!row) return null
            return (
              <div
                key={t.id}
                className="grid grid-cols-[110px_1fr_150px_170px] items-center gap-2 rounded-lg border border-line px-2.5 py-2"
              >
                <span className="truncate text-[12px] text-ink-2" title={t.traineeNo}>
                  {t.traineeNo}
                </span>
                <Input
                  value={row.name}
                  onChange={(e) => setRow(t.id, { name: e.target.value })}
                />
                <Input
                  type="date"
                  value={row.birthDate}
                  onChange={(e) => setRow(t.id, { birthDate: e.target.value })}
                />
                <Input
                  value={row.phone}
                  placeholder={t.phoneMasked || '전화 없음'}
                  onChange={(e) => setRow(t.id, { phone: e.target.value })}
                />
              </div>
            )
          })}
        </div>
        <p className="text-[12px] text-ink-3">전화번호를 비워 두면 기존 번호를 유지해요</p>
      </div>
    </Dialog>
  )
}
