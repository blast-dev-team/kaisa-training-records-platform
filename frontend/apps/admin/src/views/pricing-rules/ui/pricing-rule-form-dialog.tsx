import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Button } from '@/src/shared/ui/button'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import { membershipGradeQueries } from '@/src/entities/trainee'
import {
  ISSUE_TYPE_LABELS,
  patchPricingRule,
  postPricingRule,
  pricingRuleQueries,
  type PricingRule,
} from '@/src/entities/certificate'

interface Props {
  rule: PricingRule | null
  isOpen: boolean
  onClose: () => void
}

/**
 * 요금 규칙 등록·수정.
 * 수정은 금액·적용 종료일·활성만 바꿀 수 있어요 (등급·발급유형·시작일은 규칙의 정체성).
 */
export function PricingRuleFormDialog({ rule, isOpen, onClose }: Props) {
  const queryClient = useQueryClient()

  const [gradeId, setGradeId] = useState('')
  const [issueType, setIssueType] = useState('original')
  const [price, setPrice] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [isActive, setIsActive] = useState(true)

  const { data: grades } = useQuery(membershipGradeQueries.list(true))

  useEffect(() => {
    if (!isOpen) return
    if (rule) {
      setGradeId(String(rule.membershipGradeId))
      setIssueType(rule.issueType)
      setPrice(String(rule.priceKrw))
      setValidFrom(rule.validFrom)
      setValidTo(rule.validTo ?? '')
      setIsActive(rule.isActive)
    } else {
      setGradeId('')
      setIssueType('original')
      setPrice('')
      setValidFrom('')
      setValidTo('')
      setIsActive(true)
    }
  }, [isOpen, rule])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (rule) {
        return patchPricingRule(rule.id, {
          price_krw: Number(price),
          valid_to: validTo || undefined,
          is_active: isActive,
        })
      }
      return postPricingRule({
        membership_grade_id: gradeId,
        issue_type: issueType as 'original' | 'reissue',
        price_krw: Number(price),
        valid_from: validFrom,
        valid_to: validTo || undefined,
        is_active: isActive,
      })
    },
    onSuccess: () => {
      toast.success(rule ? '요금 규칙을 수정했어요' : '요금 규칙을 등록했어요')
      queryClient.invalidateQueries({ queryKey: pricingRuleQueries.all() })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const valid = rule ? Number(price) > 0 : gradeId !== '' && Number(price) > 0 && validFrom !== ''

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={rule ? '요금 규칙 수정' : '요금 규칙 등록'}
      description="같은 등급·발급유형·기간에 겹치는 규칙이 있으면 서버가 거절해요"
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: rule ? '저장' : '등록',
          variant: 'primary',
          isLoading: saveMutation.isPending,
          isDisabled: !valid,
          onClick: () => saveMutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>회원 등급</Label>
            <Select
              value={gradeId}
              disabled={rule !== null}
              onChange={(e) => setGradeId(e.target.value)}
            >
              <option value="">선택</option>
              {(grades ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>발급 유형</Label>
            <Select
              value={issueType}
              disabled={rule !== null}
              onChange={(e) => setIssueType(e.target.value)}
            >
              {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>금액 (원)</Label>
          <Input
            type="number"
            min={0}
            step={100}
            placeholder="예: 1800"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>적용 시작 {rule ? '(변경 불가)' : ''}</Label>
            <Input
              type="date"
              value={validFrom}
              disabled={rule !== null}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>적용 종료 (선택)</Label>
            <Input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </div>
        </div>

        {rule && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              className="accent-[--color-accent]"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            사용중 (끄면 새 발급 건에 적용되지 않아요)
          </label>
        )}
      </div>
    </Dialog>
  )
}
