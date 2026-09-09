import type { AdminRole } from '@/src/entities/auth'

export type AdminStatus = 'active' | 'disabled'

export const ADMIN_STATUS_LABELS: Record<AdminStatus, string> = {
  active: '활성',
  disabled: '차단',
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: AdminRole
  status: AdminStatus
  lastLoginAt: string | null
  createdAt: string
}

// ── 화이트리스트 (초대 이메일) ──────────────────────────────────────────────

export type AllowedEmailStatus = 'pending' | 'joined'

export const ALLOWED_EMAIL_STATUS_LABELS: Record<AllowedEmailStatus, string> = {
  pending: '가입대기',
  joined: '가입완료',
}

export interface AllowedEmail {
  id: string
  email: string
  note: string | null
  status: AllowedEmailStatus
  createdAt: string
}

export interface AllowedEmailInput {
  email: string
  note?: string
}
