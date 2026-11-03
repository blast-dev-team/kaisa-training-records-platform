/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API origin (예: https://api-dev.kaisa.or.kr) — 미설정 시 vite 프록시(/api) */
  readonly VITE_API_URL?: string;
  /** Sentry DSN — 비우면 Sentry 비활성화 (로컬 기본) */
  readonly VITE_SENTRY_DSN?: string;
  /** Sentry 릴리즈 식별자 (선택) — 비우면 릴리즈 미지정 */
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
