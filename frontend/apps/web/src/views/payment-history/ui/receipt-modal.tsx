import { useEffect } from 'react';

import { XIcon } from '@/src/shared/icon';

export interface ReceiptModalProps {
  /** 영수증 이미지 URL — 미제공(결제 연동 전) 시 준비 중 안내 문구 노출 */
  imageUrl?: string | null;
  /** 「다운로드」 — 영수증 이미지 저장. 연동 전 미제공 */
  onDownload?: () => void;
  onClose: () => void;
}

/**
 * 영수증 모달 — Figma node 78:5020 (Modals) 기반.
 *
 * 결제수단 클릭 시 열린다. 결제 연동 전엔 이미지 자리에 Figma 플레이스홀더
 * 문구를 보여준다. ESC·배경 클릭으로 닫는다 (payment-fail-modal 관례).
 */
export function ReceiptModal({ imageUrl, onDownload, onClose }: ReceiptModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="영수증"
        onClick={(event) => event.stopPropagation()}
        className="relative flex h-[765px] max-h-[calc(100dvh-40px)] w-[500px] max-w-full flex-col overflow-clip rounded-[20px] bg-white shadow-[0px_1px_3px_0px_rgba(166,175,195,0.4)] font-sans"
      >
        {/* 모바일 — 전체화면형 모달이라 X 로 닫는다 */}
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 hidden size-8 cursor-pointer items-center justify-center text-gray-500 mobile:flex"
        >
          <XIcon className="size-6" />
        </button>
        {/* 헤더 — node 78:5021 */}
        <div className="flex w-full shrink-0 items-center border-b border-solid border-[#dfe4ea] p-[30px]">
          <p className="text-[24px] leading-[1.4] font-semibold text-gray-900">영수증</p>
        </div>

        {/* 본문 — 이미지 영역 + 다운로드 버튼 (node 78:5024) */}
        <div className="flex min-h-0 flex-[1_0_0%] flex-col gap-[15px] px-[30px] py-6">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="영수증 이미지"
              className="min-h-0 w-full flex-[1_0_0%] object-contain"
            />
          ) : (
            <div className="flex min-h-0 w-full flex-[1_0_0%] items-center justify-center bg-gray-100 px-6">
              <p className="text-center text-sm leading-[1.6] font-medium text-gray-500">
                이 결제에는 영수증 전표가 제공되지 않았어요.
                <br />
                결제 내역으로 확인해 주세요.
              </p>
            </div>
          )}

          {imageUrl && (
            <button
              type="button"
              onClick={onDownload}
              className="w-full shrink-0 rounded-lg bg-gray-900 py-4 text-base leading-normal font-bold text-white hover:bg-gray-800 cursor-pointer"
            >
              다운로드
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
