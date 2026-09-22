/**
 * 디자인 시스텘 테스트 페이지 — 공용 컴포넌트 전 변형을 한 화면에 나열.
 * 각 섹션 파일이 컴포넌트 그룹별 변형 매트릭스를 렌더링한다.
 */
import { SectionActions } from "./section-actions";
import { SectionDisplay } from "./section-display";
import { SectionInputs } from "./section-inputs";
import { SectionSelection } from "./section-selection";
import { SectionTable } from "./section-table";

export function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-gray-900">
          KAISA 디자인 시스템 — 컴포넌트 갤러리
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          공용 UI 컴포넌트의 모든 변형. 상호작용(선택/제거/페이지 이동 등)도 실제로
          동작한다.
        </p>
      </header>
      <div className="flex flex-col gap-8">
        <SectionActions />
        <SectionInputs />
        <SectionSelection />
        <SectionDisplay />
        <SectionTable />
      </div>
    </div>
  );
}
