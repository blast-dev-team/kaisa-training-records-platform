import { Button, Chip } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import type { PaymentHistoryItem } from "../api/get-payment-history-list";

export interface PaymentHistoryTableProps {
  items: PaymentHistoryItem[];
  /** 거래 명세서 PDF 클릭 — 다운로드(에러 피드백 포함)는 페이지가 담당한다 */
  onStatementClick?: (item: PaymentHistoryItem) => void;
}

/** 표 헤더·본문 공용 열 폭 — Figma node 19:25223 */
const COLUMNS = [
  "w-[120px] shrink-0", // 결제일시
  "min-w-px flex-1", // 확인서 / 교육명
  "w-[150px] shrink-0", // 결제수단
  "w-[100px] shrink-0", // 금액
  "w-[100px] shrink-0", // 상태
  "w-[80px] shrink-0", // 거래 명세서
] as const;

const HEADER_LABELS = [
  "결제일시",
  "확인서 / 교육명",
  "결제수단",
  "금액",
  "상태",
  "거래 명세서",
] as const;

const CELL_BASE = "text-sm leading-normal";
const CELL_TEXT = "text-gray-700";
const CELL_DIMMED = "text-gray-400";

/** 상태 칩 — 결제완료(green) / 환불(red), node 19:25349~19:25351 */
const STATUS_CHIP = {
  paid: { label: "결제완료", color: "green" },
  refunded: { label: "환불", color: "red" },
} as const;

function formatPaidDate(paidAt: string): string {
  return paidAt.slice(0, 10).replace(/-/g, ".");
}

/**
 * 발급·결제 내역 표 — Figma node 19:25222 기반.
 *
 * 공용 Table 컴포넌트(dense 12px 스펙)와 이 화면의 스펙(14px · 사용자 정의 열폭)이
 * 달라 페이지 전용으로 작성했다. 환불 행은 전체 텍스트가 gray-400으로 표시된다.
 */
export function PaymentHistoryTable({
  items,
  onStatementClick,
}: PaymentHistoryTableProps) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
      {/* 헤더 행 — gray-100 배경 + SemiBold 14px gray-800 */}
      <div className="flex w-full items-start border-b border-solid border-gray-200 bg-gray-100 px-4 py-3">
        {HEADER_LABELS.map((label, index) => (
          <p
            key={label}
            className={cn(
              "font-sans text-sm font-semibold leading-normal text-gray-800",
              COLUMNS[index],
              index === 5 && "text-center",
            )}
          >
            {label}
          </p>
        ))}
      </div>

      {/* 본문 행 */}
      {items.map((item) => {
        const isRefunded = item.status === "refunded";
        const textColor = isRefunded ? CELL_DIMMED : CELL_TEXT;

        return (
          <div
            key={item.id}
            className="flex w-full items-center border-b border-solid border-gray-200 bg-white px-4 py-4 last:border-b-0"
          >
            {/* 결제일시 — 날짜·시각 2줄 */}
            <div className={cn(CELL_BASE, COLUMNS[0], textColor)}>
              <p>{formatPaidDate(item.paidAt)}</p>
              <p>{item.paidAt.slice(11, 16)}</p>
            </div>

            {/* 확인서 번호 + 교육명 2줄 */}
            <div className={cn("flex flex-col justify-center gap-1", COLUMNS[1])}>
              <p className="text-sm leading-normal font-semibold text-gray-900">
                {item.certificateNumber}
              </p>
              <p className="text-sm leading-normal text-gray-400">
                {item.courseName}
              </p>
            </div>

            {/* 결제수단 — 밑줄 클릭 시 영수증(현금영수증·카드전표) 새 탭 */}
            <button
              type="button"
              onClick={() =>
                item.receiptUrl &&
                window.open(item.receiptUrl, "_blank", "noopener,noreferrer")
              }
              title={
                item.receiptUrl
                  ? "영수증 보기"
                  : "영수증은 결제 연동 후 확인할 수 있어요"
              }
              className={cn(
                CELL_BASE,
                COLUMNS[2],
                textColor,
                "cursor-pointer text-left underline decoration-from-font",
              )}
            >
              {item.method}
            </button>

            <p className={cn(CELL_BASE, COLUMNS[3], textColor)}>
              {item.amount.toLocaleString("ko-KR")}원
            </p>

            <div className={cn("flex items-center", COLUMNS[4])}>
              <Chip shape="square" color={STATUS_CHIP[item.status].color}>
                {STATUS_CHIP[item.status].label}
              </Chip>
            </div>

            {/* 거래 명세서 — 결제완료(primary) / 환불(disabled) */}
            <div className={cn("flex items-center justify-center", COLUMNS[5])}>
              <Button
                size="s"
                disabled={isRefunded}
                className="rounded-md px-3 py-1.5 text-[13px] disabled:border disabled:border-gray-300 disabled:bg-white disabled:text-gray-400"
                onClick={() => onStatementClick?.(item)}
              >
                PDF
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
