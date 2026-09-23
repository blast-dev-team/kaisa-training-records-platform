import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { WarningCircleIcon } from "@/src/shared/icon";
import { Button, Pagination } from "@/src/shared/ui";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { cn } from "@/src/shared/utils/cn";

import {
  getTrainingHistoryList,
  type CertificateStatus,
  type PeriodFilter,
  type TrainingHistoryItem,
} from "../api/get-training-history-list";
import { IssuePaymentModal } from "./issue-payment-modal";
import { CompletionCertificateModal } from "./completion-certificate-modal";
import { TrainingHistoryTable } from "./training-history-table";

/** 페이지당 목록 수 — Figma 목업(12건 2페이지) 기준 */
const PAGE_LIMIT = 10;

/** 선택 잠금 카테고리 — 확인서 발급 상태 + 수료증 전용(3년 지나 internal 수료분) */
type SelectionCategory = CertificateStatus | "completionOnly";

/** 기간 필터 칩 — Figma node 25:2519~25:2527 */
type FilterChipKey = "recent3y" | "recent1y" | "all";

const FILTER_CHIPS: { key: FilterChipKey; label: string }[] = [
  { key: "recent3y", label: "최근 3년" },
  { key: "recent1y", label: "최근 1년" },
  { key: "all", label: "전체 기간" },
];

const CHIP_BASE =
  "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap transition-[background-color,border-color,color] mobile:rounded-[6px] mobile:px-3 mobile:py-2 mobile:text-xs";
const CHIP_ACTIVE = "bg-gray-700 text-white";
const CHIP_INACTIVE = "border border-solid border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

/** 로컬(브라우저 = KST) 기준 YYYY-MM-DD — toISOString()은 UTC라 새벽에 하루 어긋난다 */
function localYMD(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 오늘 기준 N년 전 — 기간 칩의 조회 시작일 (매 렌더 재계산, 자정 넘김 대비) */
function yearsAgoYMD(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return localYMD(date);
}

/** 32 → "32", 8.5 → "8.5" — 서버 합계의 소수점 꼬리 정리 */
function formatHours(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * 교육이력 조회 — Figma node 25:2446(메인 콘텐츠) 기반.
 *
 * 필터·검색·페이지 상태는 URL 쿼리스트링이 단일 진실이다 (공유·북마크 가능).
 * - `from`/`to`: 조회 기간 직접 지정 (YYYY-MM-DD, 비면 칩 기간 적용)
 * - `period`: all (기본 recent3y는 키 생략)
 * - `q`: 교육명 검색 (조회 버튼 제출 시 반영)
 * - `page`: 1부터
 */
export function TrainingHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  /** 슈퍼 계정 — 전 회원 이력 조회. 발급 버튼이 미리보기 모드로 바뀐다 */
  const isSuper = useAuthStore((state) => state.isSuper);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  /** 표에서 체크한 행 — 발급·수료증 대상. 페이지를 넘겨도 유지된다 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 선택 카테고리 — 첫 체크 행의 상태. 페이지 넘겨도 잠금 유지용 상태 */
  const [selectedCategory, setSelectedCategory] = useState<SelectionCategory | null>(null);
  /** 선택 중 수료증 대상이 아닌 건(외부 기관 등) 수 — 수료증 버튼 활성 판정용 */
  const [selectedNotCertEligible, setSelectedNotCertEligible] = useState(0);
  /** 발급·재발급 대상 — 설정 시 결제 모달이 열린다 */
  const [issueTarget, setIssueTarget] = useState<{
    ids: string[];
    type: "original" | "reissue";
  } | null>(null);
  /** 수료증 대상 — 설정 시 무료 발급·미리보기 모달이 열린다 */
  const [certTarget, setCertTarget] = useState<string[] | null>(null);

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const period: PeriodFilter =
    searchParams.get("period") === "all"
      ? "all"
      : searchParams.get("period") === "recent1y"
        ? "recent1y"
        : "recent3y";
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  /**
   * 칩 기간의 실효 조회 범위 — picker에 그대로 노출된다.
   * URL에 from/to가 있으면 그 값이 우선(직접 지정), 없으면 칩 기간으로 오늘 기준 역산.
   * '전체 기간'은 범위 없음. 렌더마다 재계산 — '오늘'을 굳히지 않는다.
   */
  const defaultFrom =
    period === "recent1y" ? yearsAgoYMD(1) : period === "recent3y" ? yearsAgoYMD(3) : "";
  const effFrom = from || defaultFrom;
  const effTo = to || (period === "all" ? "" : localYMD(new Date()));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["training-history", "list", { effFrom, effTo, q, page, limit: PAGE_LIMIT }],
    queryFn: () =>
      getTrainingHistoryList({
        page,
        limit: PAGE_LIMIT,
        from: effFrom || undefined,
        to: effTo || undefined,
        period,
        search: q,
      }),
    placeholderData: keepPreviousData,
  });

  /** URL 업데이트 헬퍼 — 빈값은 키 삭제, 필터 변경 시 page 리셋 */
  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: false });
  };

  // 날짜 직접 지정 시 칩은 비활성 — 기간 필터가 from~to로 대체된다
  const activeChip: FilterChipKey | null = from || to ? null : period;

  const handleFilterChipClick = (key: FilterChipKey) => {
    // 칩 선택 시 직접 지정한 기간은 해제 — period 키가 칩 기간의 단일 진실이고,
    // picker 값은 이 값에서 파생된다 (recent3y가 기본이라 URL 키는 생략)
    updateParams({ from: null, to: null, period: key === "recent3y" ? null : key });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ q: searchInput.trim() || null });
  };

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  /**
   * 행의 선택 카테고리 — 확인서 발급 상태가 기본. 3년이 지나 unavailable 이어도
   * 내부 기관 수료분이면 수료증(무료) 대상이라 completionOnly 로 분류한다.
   */
  const rowCategory = (item: TrainingHistoryItem): SelectionCategory =>
    item.certificateStatus === "unavailable" && item.completionCertIssuable
      ? "completionOnly"
      : item.certificateStatus;

  /** 행 체크 가능 여부 — 발급 불가(외부·미수료) 제외 + 선택 카테고리 일치 */
  const isRowCheckable = (item: TrainingHistoryItem): boolean => {
    const category = rowCategory(item);
    return (
      category !== "unavailable" && (selectedCategory === null || category === selectedCategory)
    );
  };

  /** 현재 체크 가능한 행 — 전체선택·토글 대상 */
  const checkableIds = items.filter(isRowCheckable).map((item) => item.id);
  /** 전체선택 여부 — 현재 페이지 기준으로 판정 (선택 자체는 페이지跨 유지) */
  const allSelected =
    checkableIds.length > 0 && checkableIds.every((id) => selectedIds.includes(id));

  const toggleRow = (item: TrainingHistoryItem) => {
    const exists = selectedIds.includes(item.id);
    const next = exists ? selectedIds.filter((id) => id !== item.id) : [...selectedIds, item.id];
    setSelectedIds(next);
    // 수료증 버튼 활성 판정용 — 자격 없는 건(외부 기관 등)이 선택에 섞이면 막는다
    if (!item.completionCertIssuable) {
      setSelectedNotCertEligible((count) => Math.max(0, count + (exists ? -1 : 1)));
    }
    // 비면 잠금 해제, 처음 체크하면 그 행의 상태로 범위 고정
    setSelectedCategory(next.length === 0 ? null : (selectedCategory ?? rowCategory(item)));
    if (next.length === 0) setSelectedNotCertEligible(0);
  };

  const toggleAll = () => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const added = allSelected ? [] : checkableIds.filter((id) => !selectedIds.includes(id));
    const removed = allSelected ? checkableIds.filter((id) => selectedIds.includes(id)) : [];
    const next = allSelected
      ? selectedIds.filter((id) => !checkableIds.includes(id))
      : [...new Set([...selectedIds, ...checkableIds])];
    setSelectedIds(next);
    const ineligible = (id: string) => byId.get(id)?.completionCertIssuable !== true;
    setSelectedNotCertEligible((count) =>
      Math.max(0, count + added.filter(ineligible).length - removed.filter(ineligible).length),
    );
    if (next.length === 0) {
      setSelectedCategory(null);
      setSelectedNotCertEligible(0);
    } else if (selectedCategory === null) {
      // checkableIds는 카테고리가 비어 있을 때만 섞여 있을 수 있다 — 첫 행 상태가 그 카테고리
      const first = items.find((item) => item.id === next[0]);
      setSelectedCategory(first ? rowCategory(first) : null);
    }
  };

  /** 발급 — 선택 전체가 issuable일 때만 활성 (node 104:5378) */
  const canIssue = selectedCategory === "issuable" && selectedIds.length > 0;
  const handleIssueClick = () => {
    if (canIssue) setIssueTarget({ ids: selectedIds, type: "original" });
  };

  /** 재발급 — 선택 전체가 reissuable이면 활성 (node 99:5092) */
  const canReissue = selectedCategory === "reissuable" && selectedIds.length > 0;
  const handleReissueClick = () => {
    if (canReissue) setIssueTarget({ ids: selectedIds, type: "reissue" });
  };

  /** 수료증 — 선택 전체가 내부 기관 수료분이면 활성. 무료라 결제 없이 바로 발급 */
  const canCompletionCert = selectedIds.length > 0 && selectedNotCertEligible === 0;
  const handleCompletionCertClick = () => {
    if (canCompletionCert) setCertTarget(selectedIds);
  };

  /** 발급 완료·수료증 발급 후 — 선택 상태를 비운다 */
  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedCategory(null);
    setSelectedNotCertEligible(0);
  };

  return (
    <section className="flex flex-col gap-6 mobile:gap-5">
      <h1 className="font-sans text-[28px] leading-normal font-bold text-gray-900 mobile:text-2xl">
        교육내역 조회
      </h1>

      {/* 필터 행 — 좌: 조회 기간 picker + 기간 칩 / 우: 교육명 검색 + 조회.
          모바일(node 128:2494)은 세로 스택 — 검색 폼은 배너 아래 별도 렌더 */}
      <div className="flex items-end justify-between mobile:flex-col mobile:items-stretch">
        <div className="flex items-end gap-3 mobile:flex-col mobile:items-stretch mobile:gap-3">
          <div className="flex flex-col gap-2">
            <p className="font-sans text-[13px] leading-normal font-medium text-gray-700 mobile:text-sm mobile:font-semibold">
              조회 기간
            </p>
            <div className="flex min-w-0 items-center gap-2 mobile:gap-1.5">
              {/* KAISA DatePicker 팝오버 — 네이티브 캘린더는 디자인 시스템 밖이라 DateField 사용 */}
              <DateField
                ariaLabel="조회 시작일"
                value={effFrom}
                onChange={(dateYMD) => updateParams({ from: dateYMD || null, period: null })}
                className="w-[150px] mobile:w-auto mobile:flex-1"
              />
              <p className="font-sans text-sm leading-normal text-gray-700">~</p>
              {/* 종료일 팝오버(335px)가 오른쪽 화면 밖으로 나가지 않게 right 정렬 */}
              <DateField
                ariaLabel="조회 종료일"
                value={effTo}
                onChange={(dateYMD) => updateParams({ to: dateYMD || null, period: null })}
                popoverAlign="right"
                className="w-[150px] mobile:w-auto mobile:flex-1"
              />
            </div>
          </div>

          <div className="flex gap-2 mobile:gap-1.5">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-pressed={activeChip === chip.key}
                onClick={() => handleFilterChipClick(chip.key)}
                className={cn(CHIP_BASE, activeChip === chip.key ? CHIP_ACTIVE : CHIP_INACTIVE)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2 mobile:hidden">
          {/* 툴바용 컴팩트 입력(36px) — TextField는 폼용 높이라 여기선 노드 스펙 직접 반영 */}
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              // 네이티브 X(검색 취소) 클릭 시 조회도 리셋 — 입력이 비면 q 해제
              if (event.target.value === "") updateParams({ q: null });
            }}
            placeholder="교육명 검색"
            aria-label="교육명 검색"
            className="[&::-webkit-search-cancel-button]:cursor-pointer h-9 w-[180px] rounded-md border border-solid border-gray-300 bg-white px-3 font-sans text-sm leading-normal text-gray-800 outline-none placeholder:text-gray-400 focus:border-primary-400"
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

      {/* 안내 배너 — node 25:2456 / 모바일 131:8739 */}
      <div className="flex w-full items-start rounded-md border-l-4 border-solid border-primary-400 bg-[#f0f4ff] px-5 py-3 mobile:rounded-[4px] mobile:px-3 mobile:py-3">
        <p className="flex-1 font-sans text-sm leading-[1.6] text-primary-700 mobile:text-xs mobile:leading-[1.5]">
          기본 조회 기간 오늘부터 3년 이내 이력이 표시됩니다. &apos;전체 기간&apos; 선택 시 이전
          이력도 조회되나, 3년 초과 이력은 확인서 발급이 제한됩니다.
        </p>
      </div>

      {/* 모바일 검색 행 — 배너 아래 배치 (node 128:2494) */}
      <form onSubmit={handleSearchSubmit} className="hidden gap-2 mobile:flex">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            if (event.target.value === "") updateParams({ q: null });
          }}
          placeholder="교육명 검색"
          aria-label="교육명 검색"
          className="[&::-webkit-search-cancel-button]:cursor-pointer h-9 min-w-0 flex-1 rounded-md border border-solid border-gray-300 bg-white px-3 font-sans text-sm leading-normal text-gray-800 outline-none placeholder:text-gray-400 focus:border-primary-400"
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

      {/* 발급 툴바 — node 99:5098. 체크한 건을 일괄 발급·재발급한다 */}
      <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-stretch mobile:gap-3">
        <p className="font-sans text-sm leading-normal text-gray-500 mobile:text-[13px]">
          <span className="font-semibold">
            총 <span className="text-primary-500">{data?.total ?? 0}건</span>
          </span>{" "}
          ·{" "}
          <span className="font-semibold">
            발급 가능 <span className="text-primary-500">{data?.issuableCount ?? 0}건</span>
          </span>{" "}
          ·{" "}
          <span className="font-semibold">
            총 이수시간{" "}
            <span className="text-primary-500">{formatHours(data?.totalHoursSum ?? 0)}시간</span>
          </span>
        </p>
        <div className="flex items-center gap-3">
          {selectedIds.length === 0 && (
            <div className="flex flex-col gap-1">
              {isSuper ? (
                <>
                  <p className="font-sans text-sm leading-normal text-gray-500 mobile:text-[13px] mobile:hidden">
                    · 슈퍼 계정으로 전 회원 이력을 조회 중이에요. 발급 버튼은 미리보기만 제공해요.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-sans text-sm leading-normal text-gray-500 mobile:text-[13px] mobile:hidden">
                    · 여러 교육내역 확인서를 한번에 발급할 수 있습니다. 발급 비용은 단 건, 일괄 건
                    동일합니다.
                  </p>
                  <p className="font-sans text-sm leading-normal text-gray-500 mobile:text-[13px] mobile:hidden">
                    · 협회에서 설정한 내부기관에 대한 교육내역만 수료증 발급이 가능합니다.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 mobile:justify-end mobile:gap-2">
            {/* 데스크톱은 안내 문구가 대신 알려주므로 모바일에서만 선택 건수 노출 */}
            {selectedIds.length > 0 && (
              <p className="font-sans text-sm leading-normal text-gray-500 mobile:block mobile:text-[13px]">
                {selectedIds.length}개 선택
              </p>
            )}
            <Button
              color="black"
              size="s"
              disabled={!canReissue}
              onClick={handleReissueClick}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            >
              재발급
            </Button>
            <Button
              color="black"
              size="s"
              disabled={!canIssue}
              onClick={handleIssueClick}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            >
              발급
            </Button>
            {/* 수료증 — 내부 기관 수료내역 전용. 무료 발급 후 바로 내려받는다 */}
            <Button
              color="black"
              size="s"
              disabled={!canCompletionCert}
              onClick={handleCompletionCertClick}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium"
            >
              수료증
            </Button>
          </div>
        </div>
      </div>

      {/* 목록 표 — 로딩·에러·빈 상태는 표 컨테이너 안에서 처리 */}
      {isLoading ? (
        <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
          <div className="flex w-full items-center justify-center bg-white px-4 py-12 text-sm text-gray-500">
            교육내역을 불러오고 있어요
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
        /* 빈 상태 — Figma node 19:26075 / 모바일 131:10422 */
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-gray-100 py-10 mobile:p-5">
          <div className="flex flex-col items-center gap-2">
            <WarningCircleIcon className="size-16 text-[#D92D20] mobile:size-8" />
            <p className="font-sans text-base font-semibold leading-[1.5] tracking-[-0.48px] text-gray-500 mobile:text-sm mobile:tracking-[-0.03em]">
              조회된 내역이 없습니다.
            </p>
          </div>
          <p className="font-sans text-sm leading-normal text-gray-400">
            ‘전체 기간’으로 재조회하거나 협회로 문의하여 주십시오.
          </p>
          <a
            href="tel:0200000000"
            className="flex justify-center rounded-lg border border-solid border-gray-700 bg-white px-8 py-[14px] font-sans text-[15px] font-semibold leading-normal text-gray-700 mobile:w-full mobile:text-sm"
          >
            이력 누락 문의 (02-000-0000)
          </a>
        </div>
      ) : (
        <TrainingHistoryTable
          items={items}
          selectedIds={selectedIds}
          isRowCheckable={isRowCheckable}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
        />
      )}

      {/* 결제 모달 — 툴바 발급·재발급 클릭 시 노출 (Figma node 78:3911).
          슈퍼 계정은 미리보기 전용 — 결제·발급 단계가 안내로 바뀐다 */}
      {issueTarget !== null && (
        <IssuePaymentModal
          recordIds={issueTarget.ids}
          issueType={issueTarget.type}
          previewOnly={isSuper}
          onClose={() => setIssueTarget(null)}
        />
      )}

      {/* 수료증 모달 — 내부 기관 수료분. 무료 발급 후 미리보기에서 바로 내려받는다.
          슈퍼 계정은 발급 없이 미리보기만 */}
      {certTarget !== null && (
        <CompletionCertificateModal
          recordIds={certTarget}
          previewOnly={isSuper}
          onClose={() => setCertTarget(null)}
          onIssued={clearSelection}
        />
      )}

      {/* 목록 하단 — 건수 요약 + 페이지네이션 (node 25:2497). 모바일은 세로 중앙 정렬 (node 128:2614) */}
      <div className="flex w-full items-center justify-end mobile:flex-col mobile:items-center mobile:gap-3">
        <Pagination
          page={data?.page ?? page}
          totalPages={totalPages}
          onChange={(next) => updateParams({ page: String(next) }, false)}
        />
      </div>
    </section>
  );
}
