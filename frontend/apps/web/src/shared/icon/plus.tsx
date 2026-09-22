/**
 * KAISA 아이콘 — Figma 에셋(a23d071b) 원본 path.
 * 색은 currentColor — 래퍼의 text-* 토큰으로 제어한다.
 */

export function PlusIcon({ className = "size-full" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3.3328 8H12.6672M8 3.3328V12.6672"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
