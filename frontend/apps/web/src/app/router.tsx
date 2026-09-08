import { createBrowserRouter } from 'react-router';

// 라우트가 늘어나면 lazy import 로 코드 스플리팅한다.
export const router = createBrowserRouter([
  // 서비스 안내 (기본 페이지)
  {
    path: '/',
    lazy: async () => {
      const { IntroLayout } = await import('@/src/app/layouts/intro-layout');
      return { Component: IntroLayout };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { ServiceIntroPage } = await import('@/src/views/intro');
          return { Component: ServiceIntroPage };
        },
      },
      {
        path: 'verification-no-auth',
        lazy: async () => {
          const { VerificationNoAuthPage } = await import('@/src/views/verification-no-auth');
          return { Component: VerificationNoAuthPage };
        },
      },
      // 이용약관 — 별도 좌측 탭, ?tab= 으로 문서 전환
      {
        path: 'terms',
        lazy: async () => {
          const { TermsPage } = await import('@/src/views/terms');
          return { Component: TermsPage };
        },
      },
    ],
  },
  // 인증 완료 후 — 좌측 사이드바 (교육이력 조회 · 발급 결제 내역 · 진위확인)
  {
    path: '/',
    lazy: async () => {
      const { MainLayout } = await import('@/src/app/layouts/main-layout');
      return { Component: MainLayout };
    },
    children: [
      {
        path: "training-history",
        lazy: async () => {
          const { TrainingHistoryPage } = await import(
            "@/src/views/training-history"
          );
          return { Component: TrainingHistoryPage };
        },
      },
      {
        path: 'payment-history',
        lazy: async () => {
          const { PaymentHistoryPage } = await import('@/src/views/payment-history');
          return { Component: PaymentHistoryPage };
        },
      },
      {
        path: 'verify',
        lazy: async () => {
          const { VerificationPage } = await import('@/src/views/verification');
          return { Component: VerificationPage };
        },
      },
    ],
  },
  // 사이드바 없음 — 교육이력 상세 · 발급완료
  {
    path: '/training-history/:id',
    lazy: async () => {
      const { BareLayout } = await import('@/src/app/layouts/bare-layout');
      return { Component: BareLayout };
    },
    children: [
      {
        index: true,
        lazy: async () => {
          const { TrainingHistoryDetailPage } = await import('@/src/views/training-history-detail');
          return { Component: TrainingHistoryDetailPage };
        },
      },
      {
        path: 'complete',
        lazy: async () => {
          const { IssuanceCompletePage } = await import('@/src/views/issuance-complete');
          return { Component: IssuanceCompletePage };
        },
      },
    ],
  },
  // 디자인 시스템 컴포넌트 갤러리 (테스트 페이지)
  {
    path: '/design-system',
    lazy: async () => {
      const { DesignSystemPage } = await import('@/src/views/design-system');
      return { Component: DesignSystemPage };
    },
  },
]);
