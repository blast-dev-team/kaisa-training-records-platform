import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-toastify'

import { patchMyPassword } from '@/src/entities/auth'
import { Dialog } from '@/src/shared/ui/dialog'
import { Input } from '@/src/shared/ui/input'
import { Label } from '@/src/shared/ui/label'

const PASSWORD_HINT = '10자 이상, 영문과 숫자를 조합해 주세요'

/** 본인 비밀번호 변경 — 헤더에서 열린다. 현재 비밀번호 확인 필수. */
export function PasswordChangeDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: patchMyPassword,
    onSuccess: () => {
      toast.success('비밀번호를 변경했어요')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const isValidNew =
    newPassword.length >= 10 && /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword)
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const canSave =
    currentPassword.length > 0 && isValidNew && newPassword === confirmPassword

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title="비밀번호 변경"
      size="sm"
      description="다른 곳에서 로그인한 세션은 유지돼요."
      actions={[
        { label: '취소', onClick: onClose },
        {
          label: '변경',
          isDisabled: !canSave,
          isLoading: mutation.isPending,
          onClick: () =>
            mutation.mutate({ currentPassword, newPassword }),
        },
      ]}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">현재 비밀번호</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">새 비밀번호</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            placeholder={PASSWORD_HINT}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          {newPassword.length > 0 && !isValidNew && (
            <p className="text-xs text-danger">{PASSWORD_HINT}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="비밀번호 재입력"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
          {isMismatch && (
            <p className="text-xs text-danger">비밀번호가 일치하지 않아요</p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
