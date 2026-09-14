import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'
import { Select } from '@/src/shared/ui/select'
import { Textarea } from '@/src/shared/ui/textarea'
import {
  courseQueries,
  institutionQueries,
  patchCourse,
  postCourse,
  type Course,
} from '@/src/entities/institution'

interface Props {
  isOpen: boolean
  onClose: () => void
  course: Course | null
}

export function CourseFormDialog({ isOpen, onClose, course }: Props) {
  const queryClient = useQueryClient()
  const [institutionId, setInstitutionId] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [totalHours, setTotalHours] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)

  const { data: institutions } = useQuery(institutionQueries.list({ isActive: true }))

  useEffect(() => {
    if (!isOpen) return
    setInstitutionId(course?.institutionId ?? '')
    setName(course?.name ?? '')
    setCode(course?.courseCode ?? '')
    setTotalHours(course?.totalHours !== null && course?.totalHours !== undefined ? String(course.totalHours) : '')
    setCategory(course?.category ?? '')
    setDescription(course?.description ?? '')
    setIsActive(course?.isActive ?? true)
  }, [isOpen, course])

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        institution_id: institutionId,
        name: name.trim(),
        course_code: code.trim() || undefined,
        total_hours: Number(totalHours || 0),
        category: category.trim() || null,
        description: description.trim() || null,
        is_active: isActive,
      }
      return course ? patchCourse(course.id, input) : postCourse(input)
    },
    onSuccess: () => {
      toast.success(course ? '과정을 수정했어요' : '과정을 등록했어요')
      queryClient.invalidateQueries({ queryKey: courseQueries.all() })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={course ? '과정 수정' : '과정 등록'}
      description="이력 등록에서 과정을 선택하면 과정명·기관·시수가 자동으로 채워져요"
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: course ? '수정' : '등록',
          variant: 'primary',
          isLoading: mutation.isPending,
          isDisabled: !institutionId || !name.trim(),
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>소속 기관</Label>
          <Select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
            <option value="">기관 선택</option>
            {(institutions ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>과정명</Label>
            <Input
              placeholder="예: 2026 감리원 보수교육"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>과정코드</Label>
            <Input placeholder="선택" value={code} onChange={(e) => setCode(e.target.value)} />
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
            <Label>분류</Label>
            <Input
              placeholder="예: 법정교육"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
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
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            className="size-4 accent-[--color-accent]"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          사용중 (해제하면 이력 등록에서 제외돼요)
        </label>
      </div>
    </Dialog>
  )
}
