import { useRef, useState } from "react";
import { ApiError } from "@/src/shared/api";
import { Dialog } from "./dialog";

/** 확인 후 강제 등록할 수 있는 중복 — 감리원증번호 중복(DUPLICATE_TRAINEE)은 서버가 항상 막는다 */
const CONFIRMABLE_CODES = new Set(["DUPLICATE_TRAINING_RECORD", "DUPLICATE_TRAINEE_SUSPECTED"]);

/** 중복 경고에서 '취소'를 고름 — onError 에서 토스트 없이 무시한다 */
export class DuplicateCancelledError extends Error {
  constructor() {
    super("중복 등록을 취소했어요");
    this.name = "DuplicateCancelledError";
  }
}

/**
 * 등록 요청이 중복으로 막히면 기존 내역을 보여 주고, 확인하면 allowDuplicate=true 로 다시 보낸다.
 * @example
 * const { withConfirm, dialog } = useDuplicateConfirm();
 * mutationFn: () => withConfirm((allow) => postTrainee({ ...input, allow_duplicate: allow }))
 */
export function useDuplicateConfirm() {
  const [message, setMessage] = useState<string | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setMessage(null);
  };

  const withConfirm = async <T,>(call: (allowDuplicate: boolean) => Promise<T>): Promise<T> => {
    try {
      return await call(false);
    } catch (e: unknown) {
      if (!(e instanceof ApiError) || !CONFIRMABLE_CODES.has(e.code)) throw e;
      const ok = await new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setMessage(e.message);
      });
      if (!ok) throw new DuplicateCancelledError();
      return call(true);
    }
  };

  const dialog = (
    <Dialog
      isOpen={message !== null}
      onClose={() => settle(false)}
      size="sm"
      title="이미 등록된 것 같아요"
      description={`${message ?? ""}. 중복이 아니라면 그대로 등록할 수 있어요.`}
      actions={[
        { label: "취소", onClick: () => settle(false) },
        { label: "그래도 등록", variant: "primary", onClick: () => settle(true) },
      ]}
    />
  );

  return { withConfirm, dialog };
}
