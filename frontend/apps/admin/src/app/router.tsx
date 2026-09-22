import { createBrowserRouter, Navigate } from 'react-router'
import { AdminLayout } from './layouts/admin-layout'

const CHUNK_RELOAD_KEY = 'kaisa:chunk-reloaded'

/**
 * 배포 직후 stale chunk 복구 — 새 배포로 파일 해시가 바뀌면 이미 열려 있던 탭이
 * 옛 청크를 요청해 404 가 나고 라우터 에러가 뜬다(새로고침하면 정상).
 * 지연 로딩 실패 시 새로고침을 1회 자동 수행한다. 성공하면 플래그를 지워
 * 다음 배포에서도 1회씩 동작하고, 실패가 이어지면 루프 없이 에러를 노출한다.
 */
function lazyPage<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const mod = await load()
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return mod
    } catch (error) {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) throw error
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
      window.location.reload()
      throw error // reload 가 진행되므로 실제로는 도달하지 않는다
    }
  }
}

// 페이지 단위 lazy — 라우트가 늘어나도 이 테이블만 수정한다.
export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: lazyPage(async () => {
      const { LoginPage } = await import('@/src/views/login')
      return { Component: LoginPage }
    }),
  },
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        lazy: lazyPage(async () => {
          const { DashboardPage } = await import('@/src/views/dashboard')
          return { Component: DashboardPage }
        }),
      },
      {
        path: 'trainees',
        lazy: lazyPage(async () => {
          const { TraineeListPage } = await import('@/src/views/trainees')
          return { Component: TraineeListPage }
        }),
      },
      {
        path: 'identity-reviews',
        lazy: lazyPage(async () => {
          const { IdentityReviewListPage } = await import('@/src/views/identity-reviews')
          return { Component: IdentityReviewListPage }
        }),
      },
      {
        path: 'course-sessions',
        lazy: lazyPage(async () => {
          const { CourseSessionListPage } = await import('@/src/views/course-sessions')
          return { Component: CourseSessionListPage }
        }),
      },
      {
        path: 'training-records',
        lazy: lazyPage(async () => {
          const { TrainingRecordListPage } = await import('@/src/views/training-records')
          return { Component: TrainingRecordListPage }
        }),
      },
      {
        path: 'external-completions',
        lazy: lazyPage(async () => {
          const { ExternalCompletionListPage } = await import('@/src/views/external-completions')
          return { Component: ExternalCompletionListPage }
        }),
      },
      {
        path: 'session-names',
        lazy: lazyPage(async () => {
          const { SessionNameListPage } = await import('@/src/views/session-names')
          return { Component: SessionNameListPage }
        }),
      },
      {
        path: 'institutions',
        lazy: lazyPage(async () => {
          const { InstitutionListPage } = await import('@/src/views/institutions')
          return { Component: InstitutionListPage }
        }),
      },
      {
        path: 'membership-grades',
        lazy: lazyPage(async () => {
          const { MembershipGradeListPage } = await import('@/src/views/membership-grades')
          return { Component: MembershipGradeListPage }
        }),
      },
      {
        path: 'certificates',
        lazy: lazyPage(async () => {
          const { CertificateListPage } = await import('@/src/views/certificates')
          return { Component: CertificateListPage }
        }),
      },
      {
        path: 'payment-orders',
        lazy: lazyPage(async () => {
          const { PaymentOrderListPage } = await import('@/src/views/payment-orders')
          return { Component: PaymentOrderListPage }
        }),
      },
      {
        path: 'admin-users',
        lazy: lazyPage(async () => {
          const { AdminUserListPage } = await import('@/src/views/admin-users')
          return { Component: AdminUserListPage }
        }),
      },
      {
        path: 'allowed-emails',
        lazy: lazyPage(async () => {
          const { AllowedEmailListPage } = await import('@/src/views/allowed-emails')
          return { Component: AllowedEmailListPage }
        }),
      },
      {
        path: 'audit-logs',
        lazy: lazyPage(async () => {
          const { AuditLogListPage } = await import('@/src/views/audit-logs')
          return { Component: AuditLogListPage }
        }),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
