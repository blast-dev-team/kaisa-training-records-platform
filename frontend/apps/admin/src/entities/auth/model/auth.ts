export type AdminRole = 'super' | 'staff'

export interface Me {
  accountType: 'admin' | 'user'
  id: string
  email: string
  name: string
  role: AdminRole
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
}
