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

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super: '총관리자',
  staff: '일반',
}

/** PATCH /admin-users/:id 바디 — 부분 수정 (이메일은 로그인 식별자라 변경 불가) */
export interface AdminUserUpdateInput {
  name?: string
  role?: AdminRole
  status?: AdminStatus
  /** super 리셋용 — 있으면 해시만 교체됨 */
  password?: string
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
