import axios, { AxiosError } from 'axios'

import type { ApiErrorBody } from './types'

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

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.response.use(
  response => response,
  (error: unknown) => {
    // 로그인·회원가입 실패(401)는 화면에서 인라인 처리 — 리다이렉트 대상 아님
    const url = axios.isAxiosError(error) ? error.config?.url ?? '' : ''
    const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/register')
    const status = axios.isAxiosError(error) ? error.response?.status : undefined

    if (status === 401 && !isAuthEndpoint) {
      window.location.href = '/login'
      return new Promise(() => {}) // 이행되지 않는 프로미스 — 리다이렉트 후 불필요한 후속 처리 차단
    }

    const body = axios.isAxiosError(error)
      ? (error.response?.data as Partial<ApiErrorBody> | undefined)
      : undefined
    const message =
      body?.message ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요'
    return Promise.reject(new ApiError({ code: body?.code ?? 'INTERNAL_ERROR', message }, status ?? 500))
  },
)
