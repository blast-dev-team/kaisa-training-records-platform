import { useEffect } from 'react';

import { Button } from '@/src/shared/ui';

/**
 * 진위확인 실패 모달 — Figma 노드 32:2283 (modal-invalid) 기반.
 *
 * 노드에는 닫기 요소가 없어 배경 클릭·ESC 로만 닫는다.
 * 「다시 입력」은 모달을 닫고 입력 폼으로 돌아가고, 「협회 문의」는
 * 전화 연결 링크로 둔다 (번호는 Figma 플레이스홀더).
 */

interface VerificationFailModalProps {
  /** 「다시 입력」— 모달 닫고 입력 폼으로 복귀 */
  onRetry: () => void;
}

const TIPS = [
  '· ID의 하이픈 포함 여부를 확인하여 주십시오.',
  '· 발급 취소·환불된 확인서는 조회되지 않습니다.',
  '· 5회 이상 실패 시 일정 시간 조회가 제한됩니다.',
] as const;

/** 협회 문의 전화번호 — Figma 플레이스홀더 값 */
const CONTACT_PHONE = '02-000-0000';

export function VerificationFailModal({ onRetry }: VerificationFailModalProps) {
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
        aria-label="진위확인 실패"
        onClick={(event) => event.stopPropagation()}
        className="flex w-[480px] max-w-full flex-col gap-5 rounded-[12px] bg-white px-10 py-8 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] font-sans"
      >
        <p className="whitespace-pre text-sm text-gray-500">{`결과  ·  무효 / 에러`}</p>

        <span className="w-fit rounded-[4px] border border-[#d93333] bg-[#fae5e5] px-3 py-1.5 text-sm font-semibold text-[#bf2626]">
          확인 불가
        </span>

        <p className="text-[15px] font-medium text-gray-700">
          입력하신 진위확인 ID와 성명이 일치하는 확인서가 없습니다.
        </p>

        <div className="flex w-full flex-col gap-2 rounded-[8px] border border-solid border-[rgba(229,77,77,0.3)] bg-[#fcf2f2] px-5 py-4 text-[13px] leading-normal text-[#b23333]">
          {TIPS.map((tip) => (
            <p key={tip}>{tip}</p>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onRetry} className="flex-1 rounded-lg px-8 py-3.5 text-[15px]">
            다시 입력
          </Button>
          <Button
            variant="outlined"
            color="black"
            className="rounded-lg border-gray-700 px-8 py-3.5 text-[15px] text-gray-700"
            onClick={() => {
              window.location.href = `tel:${CONTACT_PHONE.replace(/-/g, '')}`;
            }}
          >
            협회 문의 ({CONTACT_PHONE})
          </Button>
        </div>
      </section>
    </div>
  );
}
