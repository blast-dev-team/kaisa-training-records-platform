import { useEffect, useState } from "react";

import { useAuthStore } from "@/src/shared/store/auth-store";

/** 인증 잔여 시간 포맷 — 초 → "MM:SS" (예: 564 → "09:24") */
export function formatAuthCountdown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * 인증 잔여 시간(초) — 1초마다 갱신.
 *
 * setTimeout 기반 자동 signOut 은 만료 "순간"만 알 수 있어 화면 카운트다운엔
 * 쓸 수 없다. expiresAt 에서 매초 재계산한다. 미인증이면 null.
 */
export function useAuthCountdown(): number | null {
  const expiresAt = useAuthStore((state) => state.expiresAt);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || expiresAt === null) {
      setRemaining(null);
      return;
    }

    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, expiresAt]);

  return remaining;
}
