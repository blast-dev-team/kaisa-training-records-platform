import { useEffect } from 'react';

import { Button } from '@/src/shared/ui';

/**
 * 결제 실패 모달 — Figma 노드 43:27 (modal-payment-fail) 기반.
 *
 * 노드에는 닫기 요소가 없어 배경 클릭·ESC 는 「다시 결제」와 같은 동작으로
 * 처리한다 (verification-fail-modal.tsx 관례와 동일).
 * 실 API 연결 시 PG 실패 응답의 사유 문장을 reason 으로 내려준다.
 */

interface PaymentFailModalProps {
  /** 결제 실패 사유 문장 — 미제공 시 Figma 기본 문구 */
  reason?: string;
  /** 「다시 결제」— 같은 결제수단으로 재시도 */
  onRetry: () => void;
  /** 「다른 수단 선택」— 다른 결제수단 선택 화면으로 */
  onSelectOther: () => void;
}

/** 목업 기본 사유 — Figma 노드 43:27 값 */
const DEFAULT_REASON =
  '사유: 카드사 승인 거절 (PG 응답코드 3004). 금액이 출금된 경우 자동 취소됩니다.';

export function PaymentFailModal({
  reason,
  onRetry,
  onSelectOther,
}: PaymentFailModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRetry();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRetry]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onRetry}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="결제 실패"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[480px] max-w-full flex-col gap-3.5 rounded-[12px] bg-white px-10 pt-8 pb-14 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] font-sans"
      >
        <div className="flex items-center gap-3">
          <span className="w-fit rounded-[4px] border border-[#d93333] bg-[#fae5e5] px-3 py-1.5 text-sm font-semibold text-[#bf2626]">
            결제 실패
          </span>
          <p className="text-[15px] font-medium text-gray-800">
            결제가 정상 처리되지 않았습니다.
          </p>
        </div>

        <p className="text-[13px] leading-normal text-gray-600">
          {reason ?? DEFAULT_REASON}
        </p>

        <div className="flex items-start gap-3">
          <Button
            onClick={onRetry}
            className="rounded-lg bg-[#bf2626] px-6 py-3 text-sm hover:bg-[#a81f1f]"
          >
            다시 결제
          </Button>
          <Button
            variant="outlined"
            color="gray"
            onClick={onSelectOther}
            className="rounded-lg border-gray-300 px-6 py-3 text-sm font-medium text-gray-700"
          >
            다른 수단 선택
          </Button>
        </div>
      </section>
    </div>
  );
}
