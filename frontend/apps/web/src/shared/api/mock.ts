/**
 * 목업 스위치 — 실API 연동 전까지 모든 요청을 목업 데이터로 대체한다.
 *
 * staging·prod는 secret manager가 VITE_API_URL을 주입하지만, 이 값과 무관하게
 * USE_MOCK이 true인 동안 네트워크 호출 없이 목업을 반환한다.
 * 실API 전환: 이 값을 false로 바꾼다.
 */
export const USE_MOCK = false;

/** 목업 응답 지연 — 로딩 상태 확인용 */
export const mockDelay = (ms = 300): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
