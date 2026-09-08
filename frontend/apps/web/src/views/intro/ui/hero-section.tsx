import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { useAuthStore } from "@/src/shared/store/auth-store";
import { Button, Checkbox } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

/** 좌측 — 교육이력확인서 발급 절차 */
const ISSUE_STEPS = [
  "PASS 본인인증 (성명·생년월일·휴대전화)",
  "본인 교육 이수 이력 조회",
  "확인서 신청 및 수수료 결제",
  "PDF 확인서 다운로드 (진위확인 ID 부여)",
] as const;

/** 우측 — 확인서 진위확인 절차 */
const VERIFY_STEPS = ["진위확인 ID, 성명 입력", "결과 조회"] as const;

function StepBadge({ order, active }: { order: number; active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-[14px] text-xs font-bold leading-[1.5]",
        active
          ? "bg-primary-700 text-white"
          : "border border-solid border-gray-300 bg-white text-gray-500",
      )}
    >
      {order}
    </span>
  );
}

function StepRow({
  order,
  label,
  active,
}: {
  order: number;
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-4">
      <StepBadge order={order} active={active} />
      <p
        className={cn(
          "text-base leading-[1.5] tracking-[-0.03em] whitespace-nowrap",
          active ? "text-gray-900" : "text-gray-500",
        )}
      >
        {label}
      </p>
    </div>
  );
}

function Callout({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex w-full items-start rounded-[4px] border-l-4 border-solid px-5 py-3",
        tone === "info"
          ? "border-primary-400 bg-primary-50"
          : "border-red-500 bg-red-50",
      )}
    >
      <p
        className={cn(
          "text-base font-semibold leading-[1.5] tracking-[-0.03em]",
          tone === "info" ? "text-primary-700" : "text-red-500",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * 서비스 안내 히어로 — Figma 디자인 시스템 (node 22:2236) 기반.
 *
 * 헤드라인 + 서비스 선택 카드(발급 · 진위확인 2컬럼)로 구성.
 */
export function HeroSection() {
  const navigate = useNavigate();
  const signIn = useAuthStore((state) => state.signIn);
  const [isAgreed, setIsAgreed] = useState(false);

  return (
    <section className="flex flex-1 flex-col justify-center bg-[#f6f5f0] py-15 font-sans">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col justify-center gap-10 px-20">
        <div className="flex w-full flex-col gap-4">
          <h1 className="text-4xl font-bold leading-[1.3] text-gray-900">
            계속교육이력확인서
            <br />
            온라인 발급 서비스
          </h1>
          <p className="text-base leading-[1.5] tracking-[-0.03em] text-gray-600">
            기존에는 협회 담당자가 수동으로 발급하였던 교육이력 확인서를,
            본인인증을 통해 직접 조회·발급하실 수 있습니다.
          </p>
        </div>

        <div className="flex w-full flex-col gap-6 rounded-[20px] border border-solid border-gray-200 bg-white p-8">
          <div className="flex w-full flex-col gap-2">
            <p className="text-xl font-semibold leading-[1.5] tracking-[-0.03em] text-gray-900">
              서비스 선택
            </p>
            <div className="flex w-full items-center gap-2">
              <Checkbox
                checked={isAgreed}
                onChange={(event) => setIsAgreed(event.target.checked)}
              >
                개인정보 수집·이용에 동의합니다.
              </Checkbox>
              <Link
                to="/terms?tab=privacy"
                className="text-base font-semibold leading-[1.5] tracking-[-0.03em] whitespace-nowrap text-primary-700"
              >
                전문보기
              </Link>
            </div>
          </div>

          <div className="flex w-full items-start gap-6">
            {/* 좌측 — 교육이력확인서 발급 (본인인증 필요) */}
            <div className="flex min-w-px flex-1 flex-col gap-3">
              <p className="text-sm leading-[1.5] tracking-[-0.03em] text-gray-500">
                본인인증 필요
              </p>
              <Button
                fullWidth
                size="m"
                className="rounded-lg px-6 py-4"
                disabled={!isAgreed}
                onClick={() => {
                  // 본인인증 완료로 간주 — PASS 연동 전 임시
                  signIn();
                  navigate("/training-history");
                }}
              >
                교육이력확인서 발급
              </Button>
              <div className="flex w-full flex-col gap-3">
                {ISSUE_STEPS.map((label, index) => (
                  <StepRow
                    key={label}
                    order={index + 1}
                    label={label}
                    active={index === 0}
                  />
                ))}
              </div>
              <Callout tone="info">
                발급 수수료: 확인서 1건당 3,000원 (카드 · 계좌이체 · 간편결제)
              </Callout>
              <Callout tone="warn">
                발급 제한: 교육 종료일 기준 3년 초과 이력은 발급 불가
              </Callout>
            </div>

            {/* 우측 — 확인서 진위확인 (본인인증 불필요) */}
            <div className="flex min-w-px flex-1 self-stretch flex-col gap-3">
              <div className="flex w-full flex-col gap-3">
                <p className="text-sm leading-[1.5] tracking-[-0.03em] text-gray-500">
                  본인인증 불필요
                </p>
                <Button
                  variant="outlined"
                  color="black"
                  size="l"
                  fullWidth
                  className="border-gray-800 text-gray-800"
                  onClick={() => navigate("/verification-no-auth")}
                >
                  확인서 진위확인
                </Button>
              </div>
              <div className="flex w-full flex-col gap-3">
                {VERIFY_STEPS.map((label, index) => (
                  <StepRow
                    key={label}
                    order={index + 1}
                    label={label}
                    active={index === 0}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
