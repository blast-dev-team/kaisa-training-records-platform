import type { Me } from '../model/auth'

/**
 * auth 목업 — 로그인·세션 조회를 실계정 없이 통과시킨다.
 * USE_MOCK 동안 어떤 이메일·비밀번호로도 로그인된다.
 */
export const MOCK_ME: Me = {
  accountType: 'admin',
  id: 'adm-001',
  email: 'admin@kaisa.or.kr',
  name: '김관리',
  role: 'super',
}
