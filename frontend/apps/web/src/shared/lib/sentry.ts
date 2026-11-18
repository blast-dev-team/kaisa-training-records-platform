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
 * fetch 래퍼 — 실패한 요청의 URL·메서드·상태·오류 코드를 Sentry 브레드크럼으로 남긴다.
 *
 * 요청 본문은 수집하지 않는다 — 비회원 문의 비밀번호·연락처, 생년월일 같은 개인정보가
 * 실리기 때문(2026-11-18). 응답도 본문 대신 오류 코드(code)만 남긴다.
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

    const response = await original(input, init);
    // 실패한 요청만 남긴다 — 요청 본문은 남기지 않는다(비회원 문의 비밀번호·연락처, 생년월일 등
    // 개인정보가 실린다). 응답은 오류 코드만 꺼내 남긴다
    if (!response.ok) {
      try {
        let errorCode: string | undefined;
        try {
          const body = (await response.clone().json()) as { code?: unknown };
          errorCode = typeof body?.code === "string" ? body.code : undefined;
        } catch {
          errorCode = undefined;
        }
        Sentry.addBreadcrumb({
          category: "fetch",
          type: "http",
          level: "error",
          data: { url, method, status_code: response.status, error_code: errorCode },
        });
      } catch {
        // 브레드크럼 기록 실패가 본 요청에 영향을 주지 않게
      }
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
    // SDK 기본 fetch·xhr 브레드크럼(성공 요청)은 버리고, 래퍼가 남긴 실패 브레드크럼만 둔다.
    // 예전에는 request_body 유무로 걸러 본문 없는 실패 GET(401·500)이 사라졌다
    beforeBreadcrumb: (breadcrumb) =>
      (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") &&
      breadcrumb.level !== "error"
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
