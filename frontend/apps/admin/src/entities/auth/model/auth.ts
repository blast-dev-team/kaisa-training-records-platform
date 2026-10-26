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
  /** super 가 초대할 때 발급한 1회용 코드 (XXXX-XXXX-XXXX) */
  inviteCode: string
}

/** PATCH /auth/password 바디 — 본인 비밀번호 변경 (현재 비밀번호 확인 필수) */
export interface PasswordChangeInput {
  currentPassword: string
  newPassword: string
}
