import { create } from "zustand";

interface AuthState {
  /** 본인인증(PASS) 완료 여부 — 세션 동안 유지 */
  isAuthenticated: boolean;
  /** 인증된 사용자 표시명 */
  userName: string;
  /** 본인인증 완료 — 발급 플로우 진입 시 호출 */
  signIn: (userName?: string) => void;
  /** 인증 해제 — 사이드바 "인증 해제" */
  signOut: () => void;
}

/**
 * 사이트 전역 본인인증 상태.
 *
 * PASS 본인인증 연동 전 임시 상태다. 인증 여부에 따라 진위확인 진입 경로가 갈린다
 * (인증 → /verify, 미인증 → /verification-no-auth).
 */
export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userName: "홍○○ 님",
  signIn: (userName) =>
    set((state) => ({
      isAuthenticated: true,
      userName: userName ?? state.userName,
    })),
  signOut: () => set({ isAuthenticated: false }),
}));
