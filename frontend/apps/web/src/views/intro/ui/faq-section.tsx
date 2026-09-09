import { PlusIcon } from '@/src/shared/icon';

const FAQ_ITEMS = [
  '조회되지 않는 교육 이력이 있습니다.',
  '발급한 확인서를 다시 받을 수 있습니까?',
  '환불 규정은 어떻게 됩니까?',
] as const;

/**
 * 자주 묻는 질문 — Figma 디자인 시스템 (node 22:2271) 기반.
 *
 * 접힘 상태만 디자인되어 있어 답변 전개 없이 질문 행 + plus 아이콘으로 구성.
 */
export function FaqSection() {
  return (
    <section className="font-sans">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-20 pt-5 pb-10">
        <p className="text-xl font-semibold leading-[1.5] tracking-[-0.03em] whitespace-nowrap text-gray-900">
          자주 묻는 질문
        </p>
        <div className="flex w-full flex-col items-start">
          {FAQ_ITEMS.map((question) => (
            <button
              key={question}
              type="button"
              className="flex w-full cursor-pointer items-center justify-between border-b border-solid border-gray-200 py-5 text-left"
            >
              <span className="text-base font-semibold leading-[1.5] tracking-[-0.03em] whitespace-nowrap text-gray-800">
                {question}
              </span>
              <span className="size-4 shrink-0 text-gray-400">
                <PlusIcon />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
