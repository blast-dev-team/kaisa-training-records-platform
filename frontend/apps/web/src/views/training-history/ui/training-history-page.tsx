import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';

import { CalendarBlankIcon, WarningCircleIcon } from '@/src/shared/icon';
import { Button, Pagination, TextField } from '@/src/shared/ui';
import { cn } from '@/src/shared/utils/cn';

import { getTrainingHistoryList, type PeriodFilter, type TrainingHistoryItem } from '../api/get-training-history-list';
import { IssuePaymentModal } from './issue-payment-modal';
import { TrainingHistoryTable } from './training-history-table';

/** 페이지당 목록 수 — Figma 목업(12건 2페이지) 기준 */
const PAGE_LIMIT = 10;

/** 기간 필터 칩 — Figma node 25:2519~25:2527 */
type FilterChipKey = 'recent3y' | 'recent1y' | 'all';

const FILTER_CHIPS: { key: FilterChipKey; label: string }[] = [
  { key: 'recent3y', label: '최근 3년' },
  { key: 'recent1y', label: '최근 1년' },
  { key: 'all', label: '전체 기간' },
];

const CHIP_BASE =
  'cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap transition-[background-color,border-color,color]';
const CHIP_ACTIVE = 'bg-gray-700 text-white';
const CHIP_INACTIVE = 'border border-solid border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

/** 로컬(브라우저 = KST) 기준 YYYY-MM-DD — toISOString()은 UTC라 새벽에 하루 어긋난다 */
function localYMD(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 오늘 기준 N년 전 — 기간 칩의 조회 시작일 (매 렌더 재계산, 자정 넘김 대비) */
function yearsAgoYMD(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return localYMD(date);
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
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  /** 표에서 체크한 행 — 발급 대상 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** 발급·재발급 대상 — 설정 시 결제 모달이 열린다 */
  const [issueTarget, setIssueTarget] = useState<{
    ids: string[];
    type: 'original' | 'reissue';
  } | null>(null);

  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const period: PeriodFilter =
    searchParams.get('period') === 'all'
      ? 'all'
      : searchParams.get('period') === 'recent1y'
        ? 'recent1y'
        : 'recent3y';
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

  /**
   * 칩 기간의 실효 조회 범위 — picker에 그대로 노출된다.
   * URL에 from/to가 있으면 그 값이 우선(직접 지정), 없으면 칩 기간으로 오늘 기준 역산.
   * '전체 기간'은 범위 없음. 렌더마다 재계산 — '오늘'을 굳히지 않는다.
   */
  const defaultFrom =
    period === 'recent1y' ? yearsAgoYMD(1) : period === 'recent3y' ? yearsAgoYMD(3) : '';
  const effFrom = from || defaultFrom;
  const effTo = to || (period === 'all' ? '' : localYMD(new Date()));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['training-history', 'list', { effFrom, effTo, q, page, limit: PAGE_LIMIT }],
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
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete('page');
    setSearchParams(next, { replace: false });
  };

  // 날짜 직접 지정 시 칩은 비활성 — 기간 필터가 from~to로 대체된다
  const activeChip: FilterChipKey | null = from || to ? null : period;

  const handleFilterChipClick = (key: FilterChipKey) => {
    // 칩 선택 시 직접 지정한 기간은 해제 — period 키가 칩 기간의 단일 진실이고,
    // picker 값은 이 값에서 파생된다 (recent3y가 기본이라 URL 키는 생략)
    updateParams({ from: null, to: null, period: key === 'recent3y' ? null : key });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ q: searchInput.trim() || null });
  };

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  /**
   * 선택 카테고리 잠금 — 첫 체크된 행의 상태로 범위가 고정된다.
   * 발급(issuable)을 먼저 체크하면 재발급 행은, 재발급(reissuable)을 먼저
   * 체크하면 발급 행은 체크박스가 비활성화된다. 발급 불가는 항상 잠김.
   */
  const selectedCategory = (() => {
    for (const id of selectedIds) {
      const item = items.find((candidate) => candidate.id === id);
      if (item) return item.certificateStatus;
    }
    return null;
  })();

  /** 행 체크 가능 여부 — 발급 불가 제외 + 선택 카테고리 일치 */
  const isRowCheckable = (item: TrainingHistoryItem): boolean =>
    item.certificateStatus !== 'unavailable' &&
    (selectedCategory === null || item.certificateStatus === selectedCategory);

  /** 현재 체크 가능한 행 — 전체선택·토글 대상 */
  const checkableIds = items.filter(isRowCheckable).map((item) => item.id);
  /** 현재 페이지 기준으로 정리된 선택 — 페이지 이동·필터 변경에 어긋나지 않게 */
  const effectiveSelectedIds = selectedIds.filter((id) =>
    checkableIds.includes(id),
  );
  const allSelected =
    checkableIds.length > 0 && checkableIds.every((id) => effectiveSelectedIds.includes(id));

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selected) => selected !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    setSelectedIds((prev) =>
      allSelected
        ? prev.filter((id) => !checkableIds.includes(id))
        : [...new Set([...prev, ...checkableIds])],
    );
  };

  /** 발급 — 선택 전체가 issuable일 때만 활성 (node 104:5378) */
  const canIssue = selectedCategory === 'issuable' && effectiveSelectedIds.length > 0;
  const handleIssueClick = () => {
    if (canIssue) setIssueTarget({ ids: effectiveSelectedIds, type: 'original' });
  };

  /** 재발급 — 선택 전체가 reissuable이면 활성 (node 99:5092) */
  const canReissue = selectedCategory === 'reissuable' && effectiveSelectedIds.length > 0;
  const handleReissueClick = () => {
    if (canReissue) setIssueTarget({ ids: effectiveSelectedIds, type: 'reissue' });
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-sans text-[28px] leading-normal font-bold text-gray-900">
        교육이력 조회
      </h1>

      {/* 필터 행 — 좌: 조회 기간 picker + 기간 칩 / 우: 교육명 검색 + 조회 */}
      <div className="flex items-end justify-between">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-2">
            <p className="font-sans text-[13px] leading-normal font-medium text-gray-700">
              조회 기간
            </p>
            <div className="flex items-center gap-2">
              <TextField
                type="date"
                aria-label="조회 시작일"
                value={effFrom}
                onChange={(event) =>
                  updateParams({ from: event.target.value || null, period: null })
                }
                onClick={(event) => {
                  // 인디케이터를 숨겨서, 입력창 클릭으로 직접 캘린더를 띄운다
                  try {
                    event.currentTarget.showPicker();
                  } catch {
                    // 이미 열려 있거나 미지원 브라우저 — 포커스만으로 충분하다
                  }
                }}
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
                value={effTo}
                onChange={(event) =>
                  updateParams({ to: event.target.value || null, period: null })
                }
                onClick={(event) => {
                  // 인디케이터를 숨겨서, 입력창 클릭으로 직접 캘린더를 띄운다
                  try {
                    event.currentTarget.showPicker();
                  } catch {
                    // 이미 열려 있거나 미지원 브라우저 — 포커스만으로 충분하다
                  }
                }}
                rightIcon={
                  <span className="text-gray-800">
                    <CalendarBlankIcon className="size-5" />
                  </span>
                }
                className="w-[150px] [&_input::-webkit-calendar-picker-indicator]:hidden"
              />
            </div>
          </div>

          <div className="flex gap-2">
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

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          {/* 툴바용 컴팩트 입력(36px) — TextField는 폼용 높이라 여기선 노드 스펙 직접 반영 */}
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              // 네이티브 X(검색 취소) 클릭 시 조회도 리셋 — 입력이 비면 q 해제
              if (event.target.value === '') updateParams({ q: null });
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

      {/* 안내 배너 — node 25:2456 */}
      <div className="flex w-full items-start rounded-md border-l-4 border-solid border-primary-400 bg-[#f0f4ff] px-5 py-3">
        <p className="flex-1 font-sans text-sm leading-[1.6] text-primary-700">
          기본 조회 기간 오늘부터 3년 이내 이력이 표시됩니다. &apos;전체 기간&apos; 선택 시 이전
          이력도 조회되나, 3년 초과 이력은 확인서 발급이 제한됩니다.
        </p>
      </div>

      {/* 발급 툴바 — node 99:5098. 체크한 건을 일괄 발급·재발급한다 */}
      <div className="flex items-center justify-end gap-3">
        <p className="font-sans text-sm leading-normal text-gray-500">
          여러 교육내역 확인서를 한번에 발급할 수 있습니다. 발급 비용은 단 건, 일괄 건
          동일합니다.
        </p>
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
                : '문제가 생겼어요. 잠시 후 다시 시도해 주세요'}
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
          selectedIds={effectiveSelectedIds}
          isRowCheckable={isRowCheckable}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
        />
      )}

      {/* 결제 모달 — 툴바 발급·재발급 클릭 시 노출 (Figma node 78:3911) */}
      {issueTarget !== null && (
        <IssuePaymentModal
          recordIds={issueTarget.ids}
          issueType={issueTarget.type}
          onClose={() => setIssueTarget(null)}
          onIssued={() => setSelectedIds([])}
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
