import { useState } from "react";

import {
  Button,
  Indicator,
  OnboardingBubble,
  Pagination,
  ProgressBar,
  Toast,
  Tooltip,
} from "@/src/shared/ui";

import { Demo, DemoRow, DemoSection } from "./demo-section";

/** Indicator · ProgressBar · Pagination · Toast · Tooltip · OnboardingBubble 전 변형 */
export function SectionDisplay() {
  const [page, setPage] = useState(1);
  const [limitPage, setLimitPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [toastVisible, setToastVisible] = useState(true);
  const [bubbleStep, setBubbleStep] = useState(1);
  const [bubbleVisible, setBubbleVisible] = useState(true);

  return (
    <DemoSection title="Indicator / ProgressBar / Pagination / Toast / Tooltip / OnboardingBubble">
      <DemoRow>
        <Demo label="Indicator — order 1~5">
          <div className="flex items-center gap-6">
            {[1, 2, 3, 4, 5].map((order) => (
              <Indicator key={order} order={order as 1 | 2 | 3 | 4 | 5} />
            ))}
          </div>
        </Demo>
        <Demo label="ProgressBar — size l/m/s × leftText/rightText">
          <div className="flex flex-col gap-3">
            <ProgressBar value={70} size="l" leftText rightText />
            <ProgressBar value={45} size="m" rightText />
            <ProgressBar value={10} size="s" leftText />
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Pagination — 기본 (클릭 가능)">
          <Pagination page={page} totalPages={5} onChange={setPage} />
        </Demo>
        <Demo label="Pagination — numberOfList 변형">
          <Pagination
            page={limitPage}
            totalPages={5}
            onChange={setLimitPage}
            limitOptions={[10, 20, 50]}
            limit={limit}
            onLimitChange={setLimit}
          />
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Toast — success/error/caution">
          <div className="flex flex-col gap-2">
            <Toast type="success">저장되었습니다</Toast>
            <Toast type="error">저장에 실패했습니다</Toast>
            <Toast type="caution">네트워크 연결을 확인하세요</Toast>
          </div>
        </Demo>
        <Demo label="Toast — onClose (X 클릭 시 실제 닫힘)">
          <div className="flex flex-col gap-2">
            {toastVisible ? (
              <Toast type="success" onClose={() => setToastVisible(false)}>
                닫기 버튼이 있는 토스트
              </Toast>
            ) : (
              <Button size="s" onClick={() => setToastVisible(true)}>
                토스트 다시 보기
              </Button>
            )}
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Tooltip — 방향 4종 (hover/focus)">
          {/* 말풍선이 240px 벌어지므로 여백 확보 */}
          <div className="flex items-center gap-16 px-32 py-16">
            <Tooltip description="topLeft — 말풍선 우하단이 트리거 좌상단에 맞닿음" direction="topLeft" />
            <Tooltip description="topRight — 말풍선 좌하단이 트리거 우상단에 맞닿음" direction="topRight" />
            <Tooltip description="bottomLeft — 말풍선 우상단이 트리거 좌하단에 맞닿음" direction="bottomLeft" />
            <Tooltip description="bottomRight — 말풍선 좌상단이 트리거 우하단에 맞닿음" direction="bottomRight" />
          </div>
        </Demo>
        <Demo label="Tooltip — children 트리거 교체">
          <Tooltip description="호출부 요소에 그대로 붙이는 변형" direction="bottomRight">
            <Button size="s" variant="outlined">
              여기에 hover
            </Button>
          </Tooltip>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="OnboardingBubble — 이전/다음/닫기 동작">
          <div className="flex flex-col gap-3">
            {bubbleVisible ? (
              <OnboardingBubble
                step={bubbleStep}
                totalSteps={3}
                onPrev={() => setBubbleStep((s) => Math.max(1, s - 1))}
                onNext={() => setBubbleStep((s) => Math.min(3, s + 1))}
                onClose={() => setBubbleVisible(false)}
              />
            ) : (
              <Button size="s" onClick={() => setBubbleVisible(true)}>
                온보딩 버블 다시 보기
              </Button>
            )}
          </div>
        </Demo>
        <Demo label="OnboardingBubble — 커스텀 문구">
          <OnboardingBubble
            title="커스텀 제목"
            description="description prop으로 교체한 설명입니다."
            step={2}
            totalSteps={4}
          />
        </Demo>
      </DemoRow>
    </DemoSection>
  );
}
