import * as Sentry from "@sentry/react";

/** URL 앞段 → 기능명. 이슈를 "결제주문에서 터짐", "확인서에서 터짐"으로 묶는 태그. */
const FEATURE_BY_PREFIX: [RegExp, string][] = [
  [/^\/login/, "로그인"],
  [/^\/trainees/, "교육생"],
  [/^\/identity-reviews/, "본인인증심사"],
  [/^\/course-sessions/, "교육과정"],
  [/^\/training-records/, "교육내역"],
  [/^\/membership-grades/, "회원등급"],
  [/^\/certificates/, "확인서"],
  [/^\/payment-orders/, "결제주문"],
  [/^\/inquiries/, "문의"],
  [/^\/admin-users/, "관리자계정"],
  [/^\/allowed-emails/, "허용이메일"],
  [/^\/audit-logs/, "감사로그"],
];

function classifyFeature(pathname: string): string {
  for (const [re, name] of FEATURE_BY_PREFIX) {
    if (re.test(pathname)) return name;
  }
  return pathname === "/" ? "대시보드" : pathname;
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
    // admin은 axios(XHR) — instance.ts 인터셉터가 본문 포함 브레드크럼을 남긴다.
    // SDK 기본 xhr 브레드크럼(본문 없음)은 중복이라 버리고, 본문 있는 것만 남긴다.
    // 기본 xhr/fetch 브레드크럼은 버리고 인터셉터가 남긴 실패 브레드크럼(error_code 포함)만 둔다
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
}

/**
 * react-query 는 쿼리 에러를 삼켜 전역 핸들러에 안 걸린다 — QueryCache.onError 에서 호출.
 * axios 에러의 HTTP 4xx 는 기대된 비즈니스·인증 응답이라 수집하지 않는다
 * (401 세션 만료·404 없는 리소스가 매번 이슈로 쌓이는 노이즈 방지).
 * 서버 5xx 와 네트워크 오류(응답 자체가 없는 경우)만 수집.
 */
export function captureQueryError(error: unknown): void {
  // 인터셉터가 모든 응답 오류를 ApiError(status 필드)로 바꿔 reject 한다 — AxiosError 의
  // response.status 만 보던 예전 판정은 항상 통과해 4xx 까지 수집했다
  const err = error as { status?: number; response?: { status?: number } } | null;
  const status = err?.status ?? err?.response?.status;
  if (typeof status === "number" && status < 500) return;
  Sentry.captureException(error);
}
