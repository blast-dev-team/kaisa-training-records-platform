/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API 베이스 URL — 미설정 시 진위확인 목업 동작 */
  readonly VITE_API_URL?: string;
  /** 포트원 스토어 ID — 관리자콘솔 내 정보 */
  readonly VITE_PORTONE_STORE_ID?: string;
  /** 포트원 채널 키 — 결제연동 > 연동 정보 */
  readonly VITE_PORTONE_CHANNEL_KEY?: string;
  /** 포트원 본인인증 채널 키 — 결제 채널과 별개 */
  readonly VITE_PORTONE_IDENTITY_CHANNEL_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
