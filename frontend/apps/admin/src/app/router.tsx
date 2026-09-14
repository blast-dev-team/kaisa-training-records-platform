import { createBrowserRouter, Navigate } from 'react-router'
import { AdminLayout } from './layouts/admin-layout'

// 페이지 단위 lazy — 라우트가 늘어나도 이 테이블만 수정한다.
export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => {
      const { LoginPage } = await import('@/src/views/login')
      return { Component: LoginPage }
    },
  },
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { DashboardPage } = await import('@/src/views/dashboard')
          return { Component: DashboardPage }
        },
      },
      {
        path: 'trainees',
        lazy: async () => {
          const { TraineeListPage } = await import('@/src/views/trainees')
          return { Component: TraineeListPage }
        },
      },
      {
        path: 'identity-reviews',
        lazy: async () => {
          const { IdentityReviewListPage } = await import('@/src/views/identity-reviews')
          return { Component: IdentityReviewListPage }
        },
      },
      {
        path: 'training-records',
        lazy: async () => {
          const { TrainingRecordListPage } = await import('@/src/views/training-records')
          return { Component: TrainingRecordListPage }
        },
      },
      {
        path: 'external-completions',
        lazy: async () => {
          const { ExternalCompletionListPage } = await import('@/src/views/external-completions')
          return { Component: ExternalCompletionListPage }
        },
      },
      {
        path: 'institutions',
        lazy: async () => {
          const { InstitutionListPage } = await import('@/src/views/institutions')
          return { Component: InstitutionListPage }
        },
      },
      {
        path: 'membership-grades',
        lazy: async () => {
          const { MembershipGradeListPage } = await import('@/src/views/membership-grades')
          return { Component: MembershipGradeListPage }
        },
      },
      {
        path: 'certificates',
        lazy: async () => {
          const { CertificateListPage } = await import('@/src/views/certificates')
          return { Component: CertificateListPage }
        },
      },
      {
        path: 'payment-orders',
        lazy: async () => {
          const { PaymentOrderListPage } = await import('@/src/views/payment-orders')
          return { Component: PaymentOrderListPage }
        },
      },
      {
        path: 'pricing-rules',
        lazy: async () => {
          const { PricingRuleListPage } = await import('@/src/views/pricing-rules')
          return { Component: PricingRuleListPage }
        },
      },
      {
        path: 'admin-users',
        lazy: async () => {
          const { AdminUserListPage } = await import('@/src/views/admin-users')
          return { Component: AdminUserListPage }
        },
      },
      {
        path: 'allowed-emails',
        lazy: async () => {
          const { AllowedEmailListPage } = await import('@/src/views/allowed-emails')
          return { Component: AllowedEmailListPage }
        },
      },
      {
        path: 'audit-logs',
        lazy: async () => {
          const { AuditLogListPage } = await import('@/src/views/audit-logs')
          return { Component: AuditLogListPage }
        },
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
