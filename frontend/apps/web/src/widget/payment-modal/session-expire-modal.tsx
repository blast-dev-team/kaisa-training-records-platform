import { useEffect } from 'react';

import { Button } from '@/src/shared/ui';

/**
 * 본인인증 세션 만료 모달 — Figma 노드 37:26653 기반.
 *
 * 노드에는 닫기 요소가 없어 배경 클릭·ESC 로만 닫는다
 * (verification-fail-modal.tsx 관례와 동일).
 * 실 API 연결 시 본인인증 세션 타임아웃(10분) 응답을 받아 이 모달을 띄운다.
 */

interface SessionExpireModalProps {
  /** 「본인인증 다시 하기」— 모달 닫고 본인인증 처음부터 다시 시작 */
  onRetry: () => void;
}

export function SessionExpireModal({ onRetry }: SessionExpireModalProps) {
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
        aria-label="세션 만료"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[480px] max-w-full flex-col gap-3.5 rounded-[12px] bg-white px-10 py-8 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] font-sans"
      >
        <div className="flex items-center gap-3">
          <span className="w-fit rounded-[4px] border border-gray-300 bg-[#f2f2f2] px-3 py-1.5 text-sm font-semibold text-gray-600">
            세션 만료
          </span>
          <p className="text-[15px] font-medium text-gray-800">
            본인인증 유효시간(10분)이 만료되었습니다.
          </p>
        </div>

        <Button
          variant="outlined"
          color="gray"
          onClick={onRetry}
          className="w-fit rounded-lg px-6 py-3 text-sm font-medium text-gray-700"
        >
          본인인증 다시 하기
        </Button>
      </section>
    </div>
  );
}
