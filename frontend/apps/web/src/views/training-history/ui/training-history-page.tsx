import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { WarningCircleIcon } from "@/src/shared/icon";
import { Button, Pagination } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import {
  getTrainingHistoryList,
  type PeriodFilter,
} from "../api/get-training-history-list";
import { TrainingHistoryTable } from "./training-history-table";

/** 페이지당 목록 수 — Figma 목업(12건 2페이지) 기준 */
const PAGE_LIMIT = 10;

/** 기간·발급가능 필터 칩 — Figma node 25:2519~25:2527 */
type FilterChipKey = "recent3y" | "all" | "issuable";

const FILTER_CHIPS: { key: FilterChipKey; label: string }[] = [
  { key: "recent3y", label: "최근 3년" },
  { key: "all", label: "전체 기간" },
  { key: "issuable", label: "발급 가능만" },
];

const CHIP_BASE =
  "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap transition-[background-color,border-color,color]";
const CHIP_ACTIVE = "bg-gray-700 text-white";
const CHIP_INACTIVE =
  "border border-solid border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

/**
 * 교육이력 조회 — Figma node 25:2446(메인 콘텐츠) 기반.
 *
 * 필터·검색·페이지 상태는 URL 쿼리스트링이 단일 진실이다 (공유·북마크 가능).
 * - `period`: all (기본 recent3y는 키 생략)
 * - `issuable=1`: 발급 가능만
 * - `q`: 교육명 검색 (조회 버튼 제출 시 반영)
 * - `page`: 1부터
 */
export function TrainingHistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");

  const period: PeriodFilter =
    searchParams.get("period") === "all" ? "all" : "recent3y";
  const issuableOnly = searchParams.get("issuable") === "1";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "training-history",
      "list",
      { period, issuableOnly, q, page, limit: PAGE_LIMIT },
    ],
    queryFn: () =>
      getTrainingHistoryList({
        page,
        limit: PAGE_LIMIT,
        period,
        issuableOnly,
        search: q,
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

  const activeChip: FilterChipKey = issuableOnly ? "issuable" : period;

  const handleFilterChipClick = (key: FilterChipKey) => {
    if (key === "issuable") {
      updateParams({ issuable: "1" });
      return;
    }
    // 기간 칩으로 돌아올 때는 발급가능 필터 해제 — 칩 그룹이 단일 선택이라
    updateParams({ issuable: null, period: key === "all" ? "all" : null });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ q: searchInput.trim() || null });
  };

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-sans text-[28px] leading-normal font-bold text-gray-900">
        교육이력 조회
      </h1>

      {/* 필터 행 — 좌: 기간·발급가능 칩 / 우: 교육명 검색 + 조회 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={activeChip === chip.key}
              onClick={() => handleFilterChipClick(chip.key)}
              className={cn(
                CHIP_BASE,
                activeChip === chip.key ? CHIP_ACTIVE : CHIP_INACTIVE,
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          {/* 툴바용 컴팩트 입력(36px) — TextField는 폼용 높이라 여기선 노드 스펙 직접 반영 */}
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="교육명 검색"
            aria-label="교육명 검색"
            className="h-9 w-[180px] rounded-md border border-solid border-gray-300 bg-white px-3 font-sans text-sm leading-normal text-gray-800 outline-none placeholder:text-gray-400 focus:border-primary-400"
          />
          <Button
            type="submit"
            color="black"
            size="s"
            className="rounded-md bg-gray-700 px-3 py-1.5 text-[13px] hover:bg-gray-600"
          >
            조회
          </Button>
        </form>
      </div>

      {/* 안내 배너 — node 25:2456 */}
      <div className="flex w-full items-start rounded-md border-l-4 border-solid border-primary-400 bg-[#f0f4ff] px-5 py-3">
        <p className="flex-1 font-sans text-sm leading-[1.6] text-primary-700">
          기본 조회 기간 오늘부터 3년 이내 이력이 표시됩니다. &apos;전체 기간&apos;
          선택 시 이전 이력도 조회되나, 3년 초과 이력은 확인서 발급이 제한됩니다.
        </p>
      </div>

      {/* 목록 표 — 로딩·에러·빈 상태는 표 컨테이너 안에서 처리 */}
      {isLoading ? (
        <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
          <div className="flex w-full items-center justify-center bg-white px-4 py-12 text-sm text-gray-500">
            교육이력을 불러오고 있어요
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
        /* 빈 상태 — Figma node 19:26075 */
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-gray-100 py-10">
          <div className="flex flex-col items-center gap-2">
            <WarningCircleIcon className="size-16 text-[#D92D20]" />
            <p className="font-sans text-base font-semibold leading-[1.5] tracking-[-0.48px] text-gray-500">
              조회된 내역이 없습니다.
            </p>
          </div>
          <p className="font-sans text-sm leading-normal text-gray-400">
            ‘전체 기간’으로 재조회하거나 협회로 문의하여 주십시오.
          </p>
          <a
            href="tel:0200000000"
            className="rounded-lg border border-solid border-gray-700 bg-white px-8 py-[14px] font-sans text-[15px] font-semibold leading-normal text-gray-700"
          >
            이력 누락 문의 (02-000-0000)
          </a>
        </div>
      ) : (
        <TrainingHistoryTable
          items={items}
          onIssueClick={(id) => navigate(`/training-history/${id}`)}
        />
      )}

      {/* 목록 하단 — 건수 요약 + 페이지네이션 (node 25:2497) */}
      <div className="flex w-full items-center justify-between">
        <p className="font-sans text-sm leading-normal text-gray-500">
          총 {data?.total ?? 0}건 · 발급 가능 {data?.issuableCount ?? 0}건
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
