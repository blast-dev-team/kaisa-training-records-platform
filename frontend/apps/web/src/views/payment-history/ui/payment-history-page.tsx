import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { CalendarBlankIcon, DownloadSimpleIcon } from "@/src/shared/icon";
import { Button, Pagination, TextField } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import {
  getPaymentHistoryList,
  type PaymentHistoryItem,
  type PaymentStatusFilter,
} from "../api/get-payment-history-list";
import { downloadPaymentHistoryExcel } from "../api/download-payment-history-excel";
import { downloadPaymentStatement } from "../api/download-payment-statement";
import { PaymentHistoryTable } from "./payment-history-table";

/** 페이지당 목록 수 */
const PAGE_LIMIT = 10;

/** 상태 필터 칩 — Figma node 19:25279~19:25285 */
const STATUS_CHIPS: { key: PaymentStatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "paid", label: "결제 완료" },
  { key: "refunded", label: "환불" },
];

const CHIP_BASE =
  "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap transition-[background-color,border-color,color]";
const CHIP_ACTIVE = "bg-gray-700 text-white";
const CHIP_INACTIVE =
  "border border-solid border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

/**
 * 발급·결제 내역 — Figma node 19:25200(메인 콘텐츠) 기반.
 *
 * 조회 기간·상태·페이지 상태는 URL 쿼리스트링이 단일 진실이다 (공유·북마크 가능).
 * - `from`/`to`: 조회 기간 (YYYY-MM-DD, 비면 전체)
 * - `status`: paid | refunded (기본 all은 키 생략)
 * - `page`: 1부터
 */
export function PaymentHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [actionError, setActionError] = useState<string | null>(null);

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const status: PaymentStatusFilter =
    searchParams.get("status") === "paid" ||
    searchParams.get("status") === "refunded"
      ? (searchParams.get("status") as PaymentStatusFilter)
      : "all";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "payment-history",
      "list",
      { from, to, status, page, limit: PAGE_LIMIT },
    ],
    queryFn: () =>
      getPaymentHistoryList({
        page,
        limit: PAGE_LIMIT,
        from: from || undefined,
        to: to || undefined,
        status,
      }),
    placeholderData: keepPreviousData,
  });

  /** URL 업데이트 헬퍼 — 빈값은 키 삭제, 필터 변경 시 page 리셋 */
  const updateParams = (
    patch: Record<string, string | null>,
    resetPage = true,
  ) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: false });
  };

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  const handleStatementClick = async (item: PaymentHistoryItem) => {
    setActionError(null);
    try {
      await downloadPaymentStatement(item);
    } catch (downloadError) {
      console.error(downloadError);
      setActionError(
        "명세서를 내려받지 못했어요. 잠시 후 다시 시도해 주세요",
      );
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-sans text-[28px] leading-normal font-bold text-gray-900">
        발급·결제 내역
      </h1>

      {/* 조회 기간 — node 19:25316 */}
      <div className="flex flex-col items-start gap-2">
        <p className="font-sans text-[13px] leading-normal font-medium text-gray-700">
          조회 기간
        </p>
        <div className="flex items-center gap-2">
          <TextField
            type="date"
            aria-label="조회 시작일"
            value={from}
            onChange={(event) => updateParams({ from: event.target.value || null })}
            rightIcon={
              <span className="text-gray-800">
                <CalendarBlankIcon className="size-5" />
              </span>
            }
            className="w-[150px] [&_input::-webkit-calendar-picker-indicator]:hidden"
          />
          <p className="font-sans text-sm leading-normal text-gray-700">~</p>
          <TextField
            type="date"
            aria-label="조회 종료일"
            value={to}
            onChange={(event) => updateParams({ to: event.target.value || null })}
            rightIcon={
              <span className="text-gray-800">
                <CalendarBlankIcon className="size-5" />
              </span>
            }
            className="w-[150px] [&_input::-webkit-calendar-picker-indicator]:hidden"
          />
        </div>
      </div>

      {/* 필터 행 — 좌: 상태 칩 / 우: 엑셀 저장 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={status === chip.key}
              onClick={() =>
                updateParams({
                  status: chip.key === "all" ? null : chip.key,
                })
              }
              className={cn(
                CHIP_BASE,
                status === chip.key ? CHIP_ACTIVE : CHIP_INACTIVE,
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <Button
          color="black"
          size="s"
          rightIcon={<DownloadSimpleIcon />}
          className="gap-2 rounded-md bg-gray-700 px-3 py-1.5 text-[13px] font-medium hover:bg-gray-600"
          onClick={() => downloadPaymentHistoryExcel(items)}
        >
          결제 내역 엑셀 저장
        </Button>
      </div>

      {/* 목록 표 — 로딩·에러·빈 상태는 표 컨테이너 안에서 처리 */}
      {isLoading ? (
        <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
          <div className="flex w-full items-center justify-center bg-white px-4 py-12 text-sm text-gray-500">
            결제 내역을 불러오고 있어요
          </div>
        </div>
      ) : isError ? (
        <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
          <div className="flex w-full flex-col items-center gap-3 bg-white px-4 py-12 text-sm text-gray-500">
            <p>
              {error instanceof Error
                ? error.message
                : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}
            </p>
            <Button
              variant="outlined"
              size="s"
              className="rounded-md px-3 py-1.5 text-[13px]"
              onClick={() => refetch()}
            >
              다시 시도
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
          <div className="flex w-full items-center justify-center bg-white px-4 py-12 text-sm text-gray-500">
            조건에 맞는 결제 내역을 찾지 못했어요. 조회 기간을 바꿔볼까요?
          </div>
        </div>
      ) : (
        <PaymentHistoryTable
          items={items}
          onStatementClick={handleStatementClick}
        />
      )}

      {/* 목록 하단 — 안내 문구(+다운로드 실패 피드백) + 페이지네이션 (node 19:25266) */}
      <div className="flex w-full items-center justify-between">
        <p
          className={cn(
            "font-sans text-sm leading-normal",
            actionError ? "text-red-500" : "text-gray-500",
          )}
        >
          {actionError ??
            "영수증(현금영수증·카드전표)은 결제수단 클릭 시 확인"}
        </p>
        <Pagination
          page={data?.page ?? page}
          totalPages={totalPages}
          onChange={(next) => updateParams({ page: String(next) }, false)}
        />
      </div>
    </section>
  );
}
