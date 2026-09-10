import { useEffect } from 'react';

import type { VerificationResult } from '@/src/shared/api/get-verification-result';

/**
 * 진위확인 결과 모달 — Figma 노드 32:20 (modal-valid) 기반.
 *
 * 노드에는 닫기 요소가 없어 배경 클릭·ESC 로만 닫는다.
 * 유효하지 않음(확인 불가)은 별도 모달 — verification-fail-modal.tsx (노드 32:2283).
 */

interface VerificationResultModalProps {
  result: VerificationResult;
  onClose: () => void;
}

const INFO_ROWS = [
  { label: '성명', key: 'applicantName' },
  { label: '확인서번호', key: 'certificateNumber' },
  { label: '교육명', key: 'courseName' },
  { label: '이수시간', key: 'completionSummary' },
  { label: '발급일', key: 'issuedAt' },
] as const;

export function VerificationResultModal({
  result,
  onClose,
}: VerificationResultModalProps) {
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
        aria-label="진위확인 결과"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[480px] max-w-full flex-col gap-6 rounded-[12px] bg-white px-10 py-8 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] font-sans"
      >
        <p className="whitespace-pre text-sm text-gray-500">
          {`결과  ·  유효`}
        </p>

        <div className="flex items-center gap-4">
          <span className="rounded-[4px] border border-[#393] bg-[#d9f2d9] px-3 py-1.5 text-sm font-semibold text-[#268026]">
            유효한 확인서
          </span>
          <p className="text-sm whitespace-nowrap text-gray-500">
            {result.queriedAt} 조회
          </p>
        </div>

        <div className="flex w-full flex-col gap-1 rounded-[16px] border border-solid border-gray-200 p-4 text-sm text-gray-700">
          {INFO_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex w-full items-center gap-6 py-3"
            >
              <p className="w-20 shrink-0 font-bold">{row.label}</p>
              <p className="whitespace-nowrap">{result[row.key]}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          본 결과는 협회 발급 기록과 일치함을 의미하며, 개인정보 보호를 위해 일부
          정보는 마스킹됩니다.
        </p>
      </section>
    </div>
  );
}
