import { useEffect, useState } from "react";

import { postPassComplete } from "@/src/shared/api/post-pass-complete";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { postPassStart } from "@/src/shared/api/post-pass-start";
import { postPassSuperLogin } from "@/src/shared/api/post-pass-super-login";
import { postPassTestLogin } from "@/src/shared/api/post-pass-test-login";
import { requestPassIdentityVerification } from "@/src/shared/lib/portone/request-identity-verification";
import { Button, TextField } from "@/src/shared/ui";

/**
 * 본인인증 모달 — 교육이력확인서 발급 버튼 클릭 시 노출.
 *
 * 성명·생년월일·휴대전화를 받아 PASS 본인인증(포트원) 창을 연다.
 * 흐름: 서버에 인증 건 등록(start) → SDK 인증창 → 완료(complete — 고객 생성·세션 쿠키).
 * 인증 성공 시 onSuccess로 로그인된 고객명을 알린다.
 * 성명이 '테스트'면 생년월일·휴대전화·PASS 인증을 생략하고 바로 로그인한다
 * (서버가 local·staging 에서만 허용).
 * 기존 모달 관례에 따라 배경 클릭·ESC 로도 닫는다 (인증 진행 중 제외).
 */

const TEST_LOGIN_NAME = "테스트";
/** 슈퍼 계정 트리거 — 성명 KAISA + 이 번호면 PASS 인증 없이 전체 조회 모드로 로그인 */
const SUPER_LOGIN_NAME = "KAISA";
const SUPER_LOGIN_PHONE = "2018202820";

interface IdentityVerificationModalProps {
  /** PASS 본인인증 성공 — 인증한 성명 전달 */
  onSuccess: (userName: string) => void;
  onClose: () => void;
}

const digitsOnly = (value: string) => value.replace(/\D/g, "");

export function IdentityVerificationModal({ onSuccess, onClose }: IdentityVerificationModalProps) {
  const setTraineeLinked = useAuthStore((state) => state.setTraineeLinked);
  const signIn = useAuthStore((state) => state.signIn);
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 성명 '테스트' — PASS 인증 우회. 생년월일·휴대전화 없이 바로 로그인한다
  const isTestLogin = name.trim() === TEST_LOGIN_NAME;
  // 슈퍼 계정 — KAISA + 지정 번호. 생년월일 없이 로그인하고 미리보기 모드로 돌린다
  const isSuperLogin =
    name.trim() === SUPER_LOGIN_NAME && phone === SUPER_LOGIN_PHONE;

  const canSubmit =
    name.trim().length > 0 &&
    (isTestLogin || isSuperLogin || (birth.length === 8 && phone.length >= 10));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const handleSubmit = async () => {
    if (!canSubmit || isPending) return;
    setIsPending(true);
    setErrorMessage("");
    try {
      if (isTestLogin) {
        // PASS 인증 생략 — 서버가 세션 쿠키를 바로 내려준다
        const user = await postPassTestLogin(name.trim());
        onSuccess(user.name ?? name.trim());
        return;
      }
      if (isSuperLogin) {
        // PASS 인증 생략 — 전체 조회(미리보기) 모드. 서버가 세션 쿠키를 내려준다
        const user = await postPassSuperLogin(name.trim());
        signIn(undefined, undefined, true, true);
        onSuccess(user.name ?? name.trim());
        return;
      }
      // 포트원 본인인증 건 ID — 시도별 고유. 서버에 등록 후 SDK 인증창에 전달한다
      const identityVerificationId = `iv-${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const { state } = await postPassStart(identityVerificationId);
      await requestPassIdentityVerification({
        identityVerificationId,
        fullName: name.trim(),
        birth,
        phoneNumber: phone,
      });
      // 서버가 포트원 결과를 검증해 고객을 찾거나 생성하고 세션 쿠키를 내려준다
      const user = await postPassComplete(state);
      // 교육생 미연결(수동 심사 대기) — 심사 대기 화면으로 갈린다
      if (user.reviewStatus === "manual_review") {
        setTraineeLinked(false);
      }
      onSuccess(user.name ?? name.trim());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "본인인증에 실패했어요. 잠시 후 다시 시도해 주세요",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="본인인증"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[420px] max-w-full flex-col gap-5 rounded-[20px] bg-white px-8 py-7 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] font-sans"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-xl font-semibold tracking-[-0.03em] text-gray-900">본인인증</p>
          <p className="text-base leading-[1.5] tracking-[-0.03em] text-gray-500">
            입력한 정보로 본인인증을 진행합니다.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <TextField
            label="성명"
            essential
            placeholder="홍길동"
            value={name}
            maxLength={30}
            helperText={
              isTestLogin
                ? "테스트 계정으로 본인인증 없이 바로 로그인합니다."
                : isSuperLogin
                  ? "슈퍼 계정으로 전체 조회(미리보기) 모드로 로그인합니다."
                  : undefined
            }
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="생년월일"
            essential
            placeholder="19900101"
            inputMode="numeric"
            maxLength={8}
            value={birth}
            helperText={birth.length > 0 && birth.length < 8 ? "8자리를 입력해 주세요" : undefined}
            onChange={(event) => setBirth(digitsOnly(event.target.value))}
          />
          <TextField
            label="휴대전화"
            essential
            placeholder="01012345678"
            inputMode="numeric"
            maxLength={11}
            value={phone}
            onChange={(event) => setPhone(digitsOnly(event.target.value))}
          />
        </div>

        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}

        <div className="flex items-center gap-3">
          <Button
            variant="outlined"
            color="black"
            className="flex-1 rounded-lg px-6 py-3.5 text-[15px] text-gray-700"
            disabled={isPending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            className="flex-1 rounded-lg px-6 py-3.5 text-[15px]"
            disabled={!canSubmit || isPending}
            onClick={handleSubmit}
          >
            {isPending
              ? isTestLogin || isSuperLogin
                ? "로그인 중..."
                : "인증 진행 중..."
              : "본인인증 시작"}
          </Button>
        </div>
      </section>
    </div>
  );
}
