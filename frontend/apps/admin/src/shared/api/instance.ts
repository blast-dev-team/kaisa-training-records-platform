import axios, { AxiosError } from 'axios'
import * as Sentry from '@sentry/react'

import type { ApiErrorBody } from './types'
import { friendlyServerMessage } from '../lib/friendly-error'

/** 백엔드 `{code, message}` 에러를 그대로 실은 Error — FE는 `err.message`(한국어)를 표시하고
 *  `err.code`로 분기한다. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fieldErrors?: { field: string; message: string }[]

  constructor(body: ApiErrorBody, status: number) {
    super(body.message)
    this.name = 'ApiError'
    this.code = body.code
    this.status = status
    this.fieldErrors = body.errors
  }
}

// BE origin (예: https://api-dev.kaisa.or.kr) — 미설정 시 상대경로(/api)로
// vite 프록시 로컬 개발. Amplify 브랜치별 환경변수로 주입.
export const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

/** 세션이 끝났다는 뜻의 401 코드 — 이 경우에만 로그인 화면으로 보낸다.
 *  INVALID_CREDENTIALS(비밀번호 변경 시 현재 비밀번호 불일치 등)는 세션과 무관하므로 화면에 그대로 전달. */
const SESSION_END_CODES = new Set(['UNAUTHORIZED', 'SESSION_EXPIRED'])

/** 실패 요청 브레드크럼 — 요청 본문은 남기지 않는다(비밀번호·전화번호 등 개인정보가 실릴 수 있음).
 *  어떤 요청이 어떤 코드로 실패했는지만 남긴다. */
export function buildErrorBreadcrumb(error: AxiosError): Sentry.Breadcrumb {
  const body = error.response?.data as Partial<ApiErrorBody> | undefined
  return {
    category: 'xhr',
    type: 'http',
    level: 'error',
    data: {
      url: `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`,
      method: error.config?.method?.toUpperCase() ?? 'GET',
      status_code: error.response?.status,
      error_code: typeof body?.code === 'string' ? body.code : undefined,
    },
  }
}

apiClient.interceptors.response.use(
  response => response,
  (error: unknown) => {
    // 로그인·회원가입 실패(401)는 화면에서 인라인 처리 — 리다이렉트 대상 아님
    const url = axios.isAxiosError(error) ? error.config?.url ?? '' : ''
    const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/register')
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    const body = axios.isAxiosError(error)
      ? (error.response?.data as Partial<ApiErrorBody> | undefined)
      : undefined

    if (axios.isAxiosError(error)) {
      Sentry.addBreadcrumb(buildErrorBreadcrumb(error))
    }

    const sessionEnded =
      status === 401 && !isAuthEndpoint && (!body?.code || SESSION_END_CODES.has(body.code))
    // 차단된 계정 — 문서(docs/admin/api.md): 안내 문구 후 로그아웃
    const accountDisabled = status === 403 && body?.code === 'ACCOUNT_DISABLED'

    if (sessionEnded || accountDisabled) {
      // 이미 로그인 화면이면 무시(루프 방지), 아니면 로그인으로 보낸다.
      // replace — 뒤로가기로 만료 페이지로 되돌아오지 않게
      if (window.location.pathname !== '/login') {
        window.location.replace(accountDisabled ? '/login?reason=disabled' : '/login')
      }
      // hanging promise 대신 reject — 쿼리·뮤테이션이 끝나야 UI가 멈추지 않는다
      return Promise.reject(
        accountDisabled
          ? new ApiError(
              {
                code: 'ACCOUNT_DISABLED',
                message: friendlyServerMessage(body?.message, 403).replace(
                  '접근 권한이 없어요',
                  '비활성화된 계정이에요',
                ),
              },
              403,
            )
          : new ApiError({ code: 'UNAUTHORIZED', message: '로그인이 필요해요' }, 401),
      )
    }

    // 서버의 한국어 message 를 그대로 쓰되, 게이트웨이 기본 응답·네트워크 끊김처럼
    // 사용자용 문장이 아닌 경우 상태별 안내로 바꾼다 — 영문 원문을 화면에 노출하지 않는다
    const message = friendlyServerMessage(body?.message, status)
    return Promise.reject(
      new ApiError(
        // 422 VALIDATION_ERROR 의 필드 오류(errors[])도 함께 넘긴다 — 폼이 필드 아래에 표시할 수 있게
        {
          code: body?.code ?? (status ? 'INTERNAL_ERROR' : 'NETWORK_ERROR'),
          message,
          errors: Array.isArray(body?.errors) ? body.errors : undefined,
        },
        status ?? 500,
      ),
    )
  },
)
