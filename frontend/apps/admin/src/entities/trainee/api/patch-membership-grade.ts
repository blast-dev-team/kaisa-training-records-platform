import { apiClient } from '@/src/shared/api'
import type { MembershipGradeDto } from './dto/trainee-dto'
import { mapMembershipGrade } from './map-trainee'
import type { MembershipGradeUpdateInput, MembershipGrade } from '../model/trainee'
import { USE_MOCK, mockDelay } from '@/src/shared/api/mock'
import { MOCK_GRADES } from './trainee-mock'

export const patchMembershipGrade = async (
  gradeId: string,
  input: MembershipGradeUpdateInput,
): Promise<MembershipGrade> => {
  if (USE_MOCK) {
    await mockDelay()
    const grade = MOCK_GRADES.find(g => g.id === gradeId)
    if (!grade) throw new Error('회원등급을 찾을 수 없어요')
    if (input.name !== undefined) grade.name = input.name
    if (input.description !== undefined) grade.description = input.description
    if (input.sort_order !== undefined) grade.sortOrder = input.sort_order
    if (input.price_krw !== undefined) grade.priceKrw = input.price_krw
    if (input.is_active !== undefined) grade.isActive = input.is_active
    return { ...grade }
  }
  const { data } = await apiClient.patch<MembershipGradeDto>(`/membership-grades/${gradeId}`, input)
  return mapMembershipGrade(data)
}
