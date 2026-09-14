/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API origin (예: https://api-dev.kaisa.or.kr) — 미설정 시 vite 프록시(/api) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
