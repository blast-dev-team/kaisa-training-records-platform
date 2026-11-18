import { create } from "zustand";

/** 본인인증 세션 유효시간(분) — 서버 USER_SESSION_TTL_MINUTES 와 동일 */
const SESSION_TTL_MINUTES = 10;

let expireTimer: ReturnType<typeof setTimeout> | null = null;

/** 기본 표시명 — 인증 해제 시 이전 사람 이름이 남지 않게 되돌린다 */
const DEFAULT_USER_NAME = "홍○○ 님";

/** 탭 간 인증 상태 동기화 — 한 탭에서 연장·해제하면 다른 탭도 같은 만료 시각·상태를 쓴다 */
type AuthSyncMessage =
  | { type: "signIn"; expiresAt: number }
  | { type: "signOut" };
const authChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kaisa-auth") : null;
let applyingRemote = false;
function broadcast(message: AuthSyncMessage): void {
  if (applyingRemote || !authChannel) return;
  try {
    authChannel.postMessage(message);
  } catch {
    // 동기화 실패는 무시 — 각 탭은 자기 타이머로도 동작한다
  }
}

interface AuthState {
  /** 본인인증(PASS) 완료 여부 — 세션 동안 유지 */
  isAuthenticated: boolean;
  /** 교육생 연결 여부 — false 면 수동 심사 대기. 심사 완료(어드민 승인) 후 다음 로그인부터 true */
  traineeLinked: boolean;
  /** 인증된 사용자 표시명 */
  userName: string;
  /** 슈퍼 계정 — 전 회원 이력 조회(미리보기) 모드. 발급 버튼이 미리보기로 바뀐다 */
  isSuper: boolean;
  /** 10분 타이머 만료로 자동 해제됐는지 — 만료 안내 모달 표시용 */
  isSessionExpired: boolean;
  /** 인증 만료 시각(epoch ms) — 사이드바 잔여 시간 표시용. 미인증이면 null */
  expiresAt: number | null;
  /** 본인인증 완료 — 발급 플로우 진입 시 호출. expiresAt 미지정 시 10분 뒤 자동 해제된다 */
  signIn: (
    userName?: string,
    expiresAt?: number,
    traineeLinked?: boolean,
    isSuper?: boolean,
  ) => void;
  /** 교육생 연결 상태만 변경 — 본인인증 직후 심사 대기 판정 */
  setTraineeLinked: (linked: boolean) => void;
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
  traineeLinked: true,
  userName: DEFAULT_USER_NAME,
  isSuper: false,
  isSessionExpired: false,
  expiresAt: null,
  signIn: (userName, expiresAt, traineeLinked, isSuper) => {
    if (expireTimer) clearTimeout(expireTimer);
    const ttlMs =
      expiresAt !== undefined
        ? Math.max(0, expiresAt - Date.now())
        : SESSION_TTL_MINUTES * 60 * 1000;
    expireTimer = setTimeout(() => {
      get().signOut();
      set({ isSessionExpired: true });
    }, ttlMs);
    // 미지정이면 현재 값 유지 — 인증 모달이 먼저 setTraineeLinked(false) 한 뒤
    // 호출부가 signIn(userName) 하면서 true 로 덮어 심사 대기 회원이 목록에 들어가던 문제
    const nextExpiresAt = expiresAt ?? Date.now() + SESSION_TTL_MINUTES * 60 * 1000;
    set((state) => ({
      isAuthenticated: true,
      traineeLinked: traineeLinked ?? state.traineeLinked,
      isSuper: isSuper ?? state.isSuper,
      userName: userName ?? state.userName,
      expiresAt: nextExpiresAt,
    }));
    broadcast({ type: "signIn", expiresAt: nextExpiresAt });
  },
  signOut: () => {
    if (expireTimer) {
      clearTimeout(expireTimer);
      expireTimer = null;
    }
    const wasAuthenticated = get().isAuthenticated;
    set({
      isAuthenticated: false,
      traineeLinked: true,
      isSuper: false,
      expiresAt: null,
      // 같은 탭에서 다음 사람이 인증할 때 이름이 비어 오면 이전 사람 이름이 보이던 문제
      userName: DEFAULT_USER_NAME,
    });
    if (wasAuthenticated) broadcast({ type: "signOut" });
  },
  setTraineeLinked: (linked) => set({ traineeLinked: linked }),
  clearSessionExpired: () => set({ isSessionExpired: false }),
}));

// 다른 탭의 연장·해제를 반영 — 연장하면 이 탭도 새 만료 시각으로 타이머를 다시 잡고,
// 해제하면 이 탭도 인증을 내린다(서버 세션은 이미 끝났다)
authChannel?.addEventListener("message", (event: MessageEvent<AuthSyncMessage>) => {
  const message = event.data;
  const state = useAuthStore.getState();
  applyingRemote = true;
  try {
    if (message?.type === "signOut" && state.isAuthenticated) {
      state.signOut();
    } else if (message?.type === "signIn" && state.isAuthenticated) {
      state.signIn(undefined, message.expiresAt);
    }
  } finally {
    applyingRemote = false;
  }
});

/** 회원 API 가 세션 종료(401 SESSION_EXPIRED·UNAUTHORIZED)를 알리면 인증 상태를 내린다 —
 *  FE 타이머만 믿으면 다른 탭에서 해제했거나 서버가 세션을 먼저 끝냈을 때 화면마다 오류만 났다. */
export function handleSessionEndResponse(status: number, code: unknown): void {
  if (status !== 401) return;
  if (code !== undefined && code !== "SESSION_EXPIRED" && code !== "UNAUTHORIZED") return;
  const state = useAuthStore.getState();
  if (!state.isAuthenticated) return;
  state.signOut();
  useAuthStore.setState({ isSessionExpired: true });
}
