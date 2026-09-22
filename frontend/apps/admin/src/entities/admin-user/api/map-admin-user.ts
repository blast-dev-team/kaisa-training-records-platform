import type { AdminUserDto, AllowedEmailDto } from './dto/admin-user-dto'
import type { AdminUser, AllowedEmail } from '../model/admin-user'

export function mapAdminUser(dto: AdminUserDto): AdminUser {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    role: dto.role,
    status: dto.status,
    lastLoginAt: dto.last_login_at,
    createdAt: dto.created_at,
  }
}

export function mapAllowedEmail(dto: AllowedEmailDto): AllowedEmail {
  return {
    id: dto.id,
    email: dto.email,
    note: dto.note,
    status: dto.status,
    createdAt: dto.created_at,
  }
}
