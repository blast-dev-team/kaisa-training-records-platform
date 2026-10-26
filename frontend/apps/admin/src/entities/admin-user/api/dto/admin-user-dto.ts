export interface AdminUserDto {
  id: string
  email: string
  name: string
  role: 'super' | 'staff'
  status: 'active' | 'disabled'
  last_login_at: string | null
  created_at: string
}

export interface AllowedEmailDto {
  id: string
  email: string
  note: string | null
  status: 'pending' | 'joined'
  invite_expires_at?: string | null
  created_at: string
}

/** 초대·재발급 응답 — 평문 코드는 이 응답에만 한 번 실린다 */
export interface AllowedEmailInviteDto extends AllowedEmailDto {
  invite_code: string
}
