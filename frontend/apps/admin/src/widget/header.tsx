import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { LogOut } from 'lucide-react'
import { toast } from 'react-toastify'

import { postLogout, type Me } from '@/src/entities/auth'
import { Badge } from '@/src/shared/ui/badge'
import { Button } from '@/src/shared/ui/button'

export function Header({ me }: { me: Me }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation({
    mutationFn: postLogout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <header className="h-14 shrink-0 border-b border-line bg-panel flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-ink-2">{me.name}</span>
        <span className="text-[12px] text-ink-3">{me.email}</span>
        {me.role === 'super' && <Badge>super</Badge>}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut />
          로그아웃
        </Button>
      </div>
    </header>
  )
}
