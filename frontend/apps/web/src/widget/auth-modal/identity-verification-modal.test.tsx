import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_HINT = /테스트 로그인 — 이 감리원으로 본인인증 없이 바로 로그인합니다/;

async function renderModal() {
  vi.resetModules();
  const { IdentityVerificationModal } = await import("./identity-verification-modal");
  render(<IdentityVerificationModal onSuccess={() => {}} onClose={() => {}} />);
}

function fill(name: string, birth: string, phone: string) {
  fireEvent.change(screen.getByPlaceholderText("홍길동"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("19900101"), { target: { value: birth } });
  fireEvent.change(screen.getByPlaceholderText("01012345678"), { target: { value: phone } });
}

describe("IdentityVerificationModal — 테스트 로그인", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("로컬·dev 에서 감리원 정보 + 01012345678 이면 바로 로그인 안내", async () => {
    vi.stubEnv("VITE_ENV", "staging");
    await renderModal();
    fill("김감리", "19850307", "01012345678");
    expect(screen.getByText(TEST_HINT)).toBeTruthy();
  });

  it("다른 휴대전화면 일반 본인인증", async () => {
    vi.stubEnv("VITE_ENV", "staging");
    await renderModal();
    fill("김감리", "19850307", "01099998888");
    expect(screen.queryByText(TEST_HINT)).toBeNull();
  });

  it("운영 빌드에서는 열리지 않는다", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENV", "production");
    await renderModal();
    fill("김감리", "19850307", "01012345678");
    expect(screen.queryByText(TEST_HINT)).toBeNull();
  });

  it("성명 KAISA 는 기존 KAISA 계정 안내", async () => {
    vi.stubEnv("VITE_ENV", "staging");
    await renderModal();
    fill("KAISA", "19900101", "01012345678");
    expect(screen.getByText(/KAISA 계정으로 본인인증 없이 바로 로그인합니다/)).toBeTruthy();
    expect(screen.queryByText(TEST_HINT)).toBeNull();
  });
});
