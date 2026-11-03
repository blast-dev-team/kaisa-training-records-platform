import * as Sentry from "@sentry/react";

import { useAuthStore } from "@/src/shared/store/auth-store";

/** URL 앞부분 → 기능명. 이슈를 "결제에서 터짐", "확인서에서 터짐"으로 묶는 태그. */
const FEATURE_BY_PREFIX: [RegExp, string][] = [
  [/^\/(payment|payment-history)/, "결제"],
  [/^\/training-history/, "교육내역"],
  [/^\/(verify|verification-no-auth|auth\/pass)/, "본인인증"],
  [/^\/inquir/, "문의"],
  [/^\/terms/, "약관"],
];

function classifyFeature(pathname: string): string {
  for (const [re, name] of FEATURE_BY_PREFIX) {
    if (re.test(pathname)) return name;
  }
  return pathname === "/" ? "홈" : pathname;
}

/**
 * fetch 래퍼 — 요청 본문(최대 2KB)과 실패 응답 본문(최대 1KB)을 Sentry
 * 브레드크럼으로 남긴다. 비회원 에러는 사용자 식별이 없으므로 "어떤 요청에
 * 어떤 값을 보냈길래 터졌는지"가 유일한 단서다.
 *
 * 개인정보(이름·전화번호)가 본문에 실릴 수 있다 — 운영 합의 하에 수집하며,
 * Sentry 기본 스크러빙(authorization 등 denylist)은 그대로 적용된다.
 * Request 객체로 부리는 호출은 본문을 읽지 않는다(스트림 소비 문제).
 */
function wrapFetch(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const requestBody =
      typeof init?.body === "string" ? init.body.slice(0, 2000) : undefined;

    const response = await original(input, init);
    try {
      let responseBody: string | undefined;
      if (!response.ok) {
        responseBody = (await response.clone().text()).slice(0, 1000);
      }
      if (requestBody !== undefined || !response.ok) {
        Sentry.addBreadcrumb({
          category: "fetch",
          type: "http",
          level: response.ok ? "info" : "error",
          data: {
            url,
            method,
            status_code: response.status,
            request_body: requestBody,
            response_body: responseBody,
          },
        });
      }
    } catch {
      // 브레드크럼 기록 실패가 본 요청에 영향을 주지 않게
    }
    return response;
  };
}

/**
 * Sentry 초기화 — DSN 미설정 시 no-op (로컬 기본).
 *
 * 환경변수는 Amplify 빌드 환경(운영) 또는 .env(로컬)에서 주입.
 * - VITE_SENTRY_DSN: 프로젝트 DSN — 비우면 Sentry 비활성화
 * - VITE_ENV: local | staging | production — Sentry environment 태그
 * - VITE_RELEASE: 릴리즈 식별자 (선택) — 비우면 릴리즈 미지정
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_ENV ?? "local",
    release: import.meta.env.VITE_RELEASE || undefined,
    // 성능 트레이싱 10% 샘플. 에러 수집은 전량.
    tracesSampleRate: 0.1,
    // SDK 기본 fetch·xhr 브레드크럼은 아래 래퍼(요청·응답 본문 포함)로 대체한다.
    // 본문이 없는 래퍼 브레드크럼(성공한 GET 등)은 남긴다.
    beforeBreadcrumb: (breadcrumb) =>
      (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") &&
      breadcrumb.data?.request_body === undefined
        ? null
        : breadcrumb,
    beforeSend(event) {
      // SPA 특성상 에러는 보통 현재 화면에서 나므로 이벤트 시점 경로로 분류
      event.tags = {
        ...event.tags,
        feature: classifyFeature(window.location.pathname),
      };
      return event;
    },
  });

  // 로그인 상태를 Sentry 사용자로 동기화 — 이슈마다 "어떤 회원"이 보인다.
  // 세션 복구(Providers의 signIn)·로그인·해제·만료 모두 store 구독으로 잡힌다.
  useAuthStore.subscribe((state, prev) => {
    if (state.isAuthenticated && state.userName !== prev.userName) {
      Sentry.setUser({
        username: state.userName,
        data: { traineeLinked: state.traineeLinked, isSuper: state.isSuper },
      });
    }
    if (!state.isAuthenticated && prev.isAuthenticated) {
      Sentry.setUser(null);
    }
  });

  wrapFetch();
}
