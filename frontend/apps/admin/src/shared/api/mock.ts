import type { Paged } from './types'

/**
 * 목업 스위치 — 실API 연동 전까지 모든 요청을 목업 데이터로 대체한다.
 *
 * staging·prod는 secret manager가 VITE_API_URL을 주입하지만, 이 값과 무관하게
 * USE_MOCK이 true인 동안 네트워크 호출 없이 목업을 반환한다.
 * 실API 전환: 이 값을 false로 바꾼다.
 */
export const USE_MOCK = false

/** 목업 응답 지연 — 로딩 상태 확인용 */
export const mockDelay = (ms = 300): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

/** 목업 배열을 서버 페이지네이션 응답처럼 잘라 반환한다 */
export function mockPage<T>(items: T[], page = 1, limit = 20): Paged<T> {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  return {
    items: items.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  }
}
