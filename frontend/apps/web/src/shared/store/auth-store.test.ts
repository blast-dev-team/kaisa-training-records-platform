import { afterEach, describe, expect, it } from "vitest";

import { useAuthStore } from "./auth-store";

afterEach(() => {
  useAuthStore.getState().signOut();
});

describe("useAuthStore.signIn", () => {
  it("심사 대기로 표시된 뒤 signIn 해도 심사 대기 상태가 유지된다", () => {
    // 인증 모달: manual_review → setTraineeLinked(false), 이후 히어로가 signIn(userName)
    useAuthStore.getState().setTraineeLinked(false);
    useAuthStore.getState().signIn("홍길동");

    expect(useAuthStore.getState().traineeLinked).toBe(false);
  });

  it("인증 연장(traineeLinked 미지정)은 심사 대기 상태를 풀지 않는다", () => {
    useAuthStore.getState().signIn("홍길동", undefined, false);
    useAuthStore.getState().signIn("홍길동", Date.now() + 60_000);

    expect(useAuthStore.getState().traineeLinked).toBe(false);
  });

  it("슈퍼 로그인 뒤 signIn(userName) 해도 슈퍼 모드가 유지된다", () => {
    useAuthStore.getState().signIn(undefined, undefined, true, true);
    useAuthStore.getState().signIn("관리자");

    expect(useAuthStore.getState().isSuper).toBe(true);
  });

  it("로그아웃 후 새 로그인은 연결 상태로 시작한다", () => {
    useAuthStore.getState().signIn("홍길동", undefined, false);
    useAuthStore.getState().signOut();
    useAuthStore.getState().signIn("김철수");

    expect(useAuthStore.getState().traineeLinked).toBe(true);
  });
});
