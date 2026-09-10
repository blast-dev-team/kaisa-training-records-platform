import { useEffect } from 'react';

/**
 * 인증해제 모달 — Figma 노드 78:3659 (modal) 기반.
 *
 * 사이드바 「인증해제」 클릭 시 노출된다. 노드에 닫기 요소가 없어
 * 배경 클릭·ESC 도 「확인」과 같은 동작으로 처리한다 (payment-fail-modal 관례).
 */

interface AuthReleaseModalProps {
  /** 「확인」 — 모달 닫고 intro 페이지로 이동 */
  onConfirm: () => void;
}

export function AuthReleaseModal({ onConfirm }: AuthReleaseModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onConfirm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onConfirm}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="인증해제"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[335px] max-w-full flex-col gap-5 rounded-[20px] bg-white p-5 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] font-sans"
      >
        <p className="text-center text-base font-semibold text-black">인증해제</p>
        <p className="text-center text-base text-black">인증이 해제되었습니다.</p>
        <button
          type="button"
          onClick={onConfirm}
          className="w-full cursor-pointer rounded-[12px] bg-gray-800 px-4 py-3 text-base font-semibold text-white"
        >
          확인
        </button>
      </section>
    </div>
  );
}
