import type { AdminUser, AllowedEmail } from '../model/admin-user'

/**
 * 관리자 계정·화이트리스트 목업.
 * USE_MOCK 동안 초대 등록·차단이 배열을 직접 갱신한다.
 */
export const MOCK_ADMIN_USERS: AdminUser[] = [
  {
    id: 'adm-001',
    email: 'admin@kaisa.or.kr',
    name: '김관리',
    role: 'super',
    status: 'active',
    lastLoginAt: '2026-09-14T08:30:00',
    createdAt: '2026-01-02T09:00:00',
  },
  {
    id: 'adm-002',
    email: 'staff@kaisa.or.kr',
    name: '박실무',
    role: 'staff',
    status: 'active',
    lastLoginAt: '2026-09-13T17:45:00',
    createdAt: '2026-01-05T10:00:00',
  },
  {
    id: 'adm-003',
    email: 'old@kaisa.or.kr',
    name: '이전직',
    role: 'staff',
    status: 'disabled',
    lastLoginAt: '2026-05-30T12:00:00',
    createdAt: '2026-01-05T10:05:00',
  },
]

export const MOCK_ALLOWED_EMAILS: AllowedEmail[] = [
  {
    id: 'eml-001',
    email: 'newstaff@kaisa.or.kr',
    note: '2026년 하반기 입사 예정',
    status: 'pending',
    createdAt: '2026-08-20T11:00:00',
  },
  {
    id: 'eml-002',
    email: 'staff@kaisa.or.kr',
    note: null,
    status: 'joined',
    createdAt: '2026-01-05T10:00:00',
  },
  {
    id: 'eml-003',
    email: 'admin@kaisa.or.kr',
    note: '대표 운영 계정',
    status: 'joined',
    createdAt: '2026-01-02T09:00:00',
  },
]
