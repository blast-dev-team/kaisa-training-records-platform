import { create } from "zustand";

/** 본인인증 세션 유효시간(분) — 서버 USER_SESSION_TTL_MINUTES 와 동일 */
const SESSION_TTL_MINUTES = 10;

let expireTimer: ReturnType<typeof setTimeout> | null = null;

interface AuthState {
  /** 본인인증(PASS) 완료 여부 — 세션 동안 유지 */
  isAuthenticated: boolean;
  /** 인증된 사용자 표시명 */
  userName: string;
  /** 10분 타이머 만료로 자동 해제됐는지 — 만료 안내 모달 표시용 */
  isSessionExpired: boolean;
  /** 인증 만료 시각(epoch ms) — 사이드바 잔여 시간 표시용. 미인증이면 null */
  expiresAt: number | null;
  /** 본인인증 완료 — 발급 플로우 진입 시 호출. expiresAt 미지정 시 10분 뒤 자동 해제된다 */
  signIn: (userName?: string, expiresAt?: number) => void;
  /** 인증 해제 — 사이드바 "인증 해제" 또는 세션 만료 */
  signOut: () => void;
  /** 만료 안내 소비 — 모달 닫을 때 호출 */
  clearSessionExpired: () => void;
}

/**
 * 사이트 전역 본인인증 상태.
 *
 * 인증 여부에 따라 진위확인 진입 경로가 갈린다 (인증 → /verify, 미인증 →
 * /verification-no-auth). 세션은 서버(httponly 쿠키)가 진실 원본이고 FE 타이머는
 * UX용 — 서버 TTL(10분)과 같은 값으로 자동 signOut 한다.
 * 새로고침하면 메모리가 비므로 Providers 가 GET /api/me/session 로 서버에서 복구한다.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  userName: "홍○○ 님",
  isSessionExpired: false,
  expiresAt: null,
  signIn: (userName, expiresAt) => {
    if (expireTimer) clearTimeout(expireTimer);
    const ttlMs =
      expiresAt !== undefined
        ? Math.max(0, expiresAt - Date.now())
        : SESSION_TTL_MINUTES * 60 * 1000;
    expireTimer = setTimeout(() => {
      get().signOut();
      set({ isSessionExpired: true });
    }, ttlMs);
    set((state) => ({
      isAuthenticated: true,
      userName: userName ?? state.userName,
      expiresAt: expiresAt ?? Date.now() + SESSION_TTL_MINUTES * 60 * 1000,
    }));
  },
  signOut: () => {
    if (expireTimer) {
      clearTimeout(expireTimer);
      expireTimer = null;
    }
    set({ isAuthenticated: false, expiresAt: null });
  },
  clearSessionExpired: () => set({ isSessionExpired: false }),
}));
