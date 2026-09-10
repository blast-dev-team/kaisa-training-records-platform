import type { ReactNode } from "react";

import { cn } from "@/src/shared/utils/cn";

/** 디자인 시스템 테스트 페이지 섹션 — 제목 + 항목 그룹 카드 */
export function DemoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_2px_4px_0_rgba(16,24,40,0.05)]">
      <h2 className="text-lg font-semibold tracking-[-0.03em] text-gray-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** 개별 데모 항목 — 작은 라벨 + 컴포넌트 */
export function Demo({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      {label && (
        <span className="text-xs font-medium tracking-[-0.03em] text-gray-400">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/** 같은 변형군을 가로로 나열하는 줄 */
export function DemoRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-4">{children}</div>
  );
}
