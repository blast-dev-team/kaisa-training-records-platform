/**
 * 사용자에게 보여 줄 오류 문구 — 서버·브라우저의 원문(영문 코드·"Failed to fetch" 등)을
 * 그대로 노출하지 않는다.
 *
 * - 서버(BE)는 한국어 message 를 내려준다 → 그대로 쓴다.
 * - 한글이 없는 문구(게이트웨이 기본 응답 "Internal server error", 라이브러리 예외 등)는
 *   HTTP 상태별 안내로 바꾼다.
 */
export const NETWORK_ERROR_MESSAGE =
  '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요'

export const DEFAULT_ERROR_MESSAGE = '문제가 생겼어요. 잠시 후 다시 시도해 주세요'

const STATUS_MESSAGES: Record<number, string> = {
  400: '요청이 올바르지 않아요. 입력값을 확인해 주세요',
  401: '로그인이 필요해요',
  403: '접근 권한이 없어요',
  404: '요청한 정보를 찾을 수 없어요',
  408: '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요',
  409: '이미 처리되었거나 다른 정보와 겹쳐요. 새로고침 후 다시 확인해 주세요',
  413: '파일이 너무 커요',
  415: '지원하지 않는 파일 형식이에요',
  422: '입력값을 확인해 주세요',
  429: '시도가 잦아요. 잠시 후 다시 시도해 주세요',
  502: '서버가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요',
  503: '서비스 점검 중이거나 일시적으로 이용할 수 없어요. 잠시 후 다시 시도해 주세요',
  504: '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요',
}

const HANGUL = /[가-힣]/

export function hasHangul(text: unknown): text is string {
  return typeof text === 'string' && HANGUL.test(text)
}

export function statusMessage(status: number | undefined): string {
  if (status === undefined || status === 0) return NETWORK_ERROR_MESSAGE
  return STATUS_MESSAGES[status] ?? DEFAULT_ERROR_MESSAGE
}

/** 서버 message 가 사용자용 한국어 문장이면 그대로, 아니면 상태별 안내 */
export function friendlyServerMessage(message: unknown, status: number | undefined): string {
  return hasHangul(message) ? message.trim() : statusMessage(status)
}

/** catch 한 아무 값 → 화면용 문구. 한국어 문장이 아니면 fallback */
export function toUserMessage(error: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return hasHangul(message) ? message : fallback
}
