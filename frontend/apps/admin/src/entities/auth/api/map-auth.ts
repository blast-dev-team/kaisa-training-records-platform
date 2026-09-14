import type { MeDto } from './dto/auth-dto'
import type { Me } from '../model/auth'

export function mapMe(dto: MeDto): Me {
  return {
    accountType: dto.account_type,
    id: dto.id,
    email: dto.email,
    name: dto.name,
    role: dto.role,
  }
}
