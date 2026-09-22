import { createBrowserRouter } from 'react-router';

const CHUNK_RELOAD_KEY = 'kaisa:chunk-reloaded';

/**
 * 배포 직후 stale chunk 복구 — 새 배포로 파일 해시가 바뀌면 이미 열려 있던 탭이
 * 옛 청크를 요청해 404 가 나고 라우터 에러가 뜬다(새로고침하면 정상).
 * 지연 로딩 실패 시 새로고침을 1회 자동 수행한다. 성공하면 플래그를 지워
 * 다음 배포에서도 1회씩 동작하고, 실패가 이어지면 루프 없이 에러를 노출한다.
 */
function lazyPage<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const mod = await load();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return mod;
    } catch (error) {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) throw error;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      window.location.reload();
      throw error; // reload 가 진행되므로 실제로는 도달하지 않는다
    }
  };
}

// 라우트가 늘어나면 lazy import 로 코드 스플리팅한다.
export const router = createBrowserRouter([
  // 서비스 안내 (기본 페이지)
  {
    path: '/',
    lazy: lazyPage(async () => {
      const { IntroLayout } = await import('@/src/app/layouts/intro-layout');
      return { Component: IntroLayout };
    }),
    children: [
      {
        index: true,
        lazy: lazyPage(async () => {
          const { ServiceIntroPage } = await import('@/src/views/intro');
          return { Component: ServiceIntroPage };
        }),
      },
      {
        path: 'verification-no-auth',
        lazy: lazyPage(async () => {
          const { VerificationNoAuthPage } = await import('@/src/views/verification-no-auth');
          return { Component: VerificationNoAuthPage };
        }),
      },
      // 이용약관 — 별도 좌측 탭, ?tab= 으로 문서 전환
      {
        path: 'terms',
        lazy: lazyPage(async () => {
          const { TermsPage } = await import('@/src/views/terms');
          return { Component: TermsPage };
        }),
      },
    ],
  },
  // 인증 완료 후 — 좌측 사이드바 (교육이력 조회 · 발급 결제 내역 · 진위확인)
  {
    path: '/',
    lazy: lazyPage(async () => {
      const { MainLayout } = await import('@/src/app/layouts/main-layout');
      return { Component: MainLayout };
    }),
    children: [
      {
        path: "training-history",
        lazy: lazyPage(async () => {
          const { TrainingHistoryPage } = await import(
            "@/src/views/training-history"
          );
          return { Component: TrainingHistoryPage };
        }),
      },
      {
        path: 'payment-history',
        lazy: lazyPage(async () => {
          const { PaymentHistoryPage } = await import('@/src/views/payment-history');
          return { Component: PaymentHistoryPage };
        }),
      },
      {
        path: 'verify',
        lazy: lazyPage(async () => {
          const { VerificationPage } = await import('@/src/views/verification');
          return { Component: VerificationPage };
        }),
      },
    ],
  },
  // 사이드바 없음 — 발급완료 (결제·발급은 목록의 모달로 대체됨)
  {
    path: '/training-history/:id',
    lazy: lazyPage(async () => {
      const { BareLayout } = await import('@/src/app/layouts/bare-layout');
      return { Component: BareLayout };
    }),
    children: [
      {
        path: 'complete',
        lazy: lazyPage(async () => {
          const { IssuanceCompletePage } = await import('@/src/views/issuance-complete');
          return { Component: IssuanceCompletePage };
        }),
      },
    ],
  },
  // 디자인 시스템 컴포넌트 갤러리 (테스트 페이지)
  {
    path: '/design-system',
    lazy: lazyPage(async () => {
      const { DesignSystemPage } = await import('@/src/views/design-system');
      return { Component: DesignSystemPage };
    }),
  },
]);
