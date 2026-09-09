export interface MeDto {
  account_type: 'admin' | 'user'
  id: string
  email: string
  name: string
  role: 'super' | 'staff'
}
