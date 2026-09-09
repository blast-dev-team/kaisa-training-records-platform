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
  created_at: string
}
