import { Checkbox } from '@/src/shared/ui';
import { cn } from '@/src/shared/utils/cn';

import type { TrainingHistoryItem } from '../api/get-training-history-list';

export interface TrainingHistoryTableProps {
  items: TrainingHistoryItem[];
  /** 선택된 행 id 목록 (현재 페이지 기준) */
  selectedIds: string[];
  /** 행 체크 가능 여부 — 발급 불가·선택 카테고리 불일치 행은 체크박스가 잠긴다 */
  isRowCheckable: (item: TrainingHistoryItem) => boolean;
  /** 행 체크박스 토글 */
  onToggleRow: (id: string) => void;
  /** 헤더 체크박스 — 체크 가능한 행 전체 선택·해제 */
  onToggleAll: () => void;
}

/** 표 헤더·본문 공용 열 폭 — Figma node 25:2458 */
const COLUMNS = [
  'w-[40px] shrink-0', // 선택 (체크박스)
  'w-[100px] shrink-0', // 수강 시작일
  'w-[100px] shrink-0', // 수강 종료일
  'min-w-px flex-1', // 교육명
  'w-[150px] shrink-0', // 교육 기관
  'w-[100px] shrink-0', // 교육 이수시간
] as const;

const HEADER_LABELS = [
  '',
  '수강 시작일',
  '수강 종료일',
  '교육명',
  '교육 기관',
  '교육 이수시간',
] as const;

const CELL_BASE = 'text-sm leading-normal';
const CELL_TEXT = 'text-gray-700';
const CELL_DIMMED = 'text-gray-400';

function formatYMD(ymd: string): string {
  return ymd.replace(/-/g, '.');
}

/**
 * 교육이력 표 — Figma node 25:2458 기반.
 *
 * 행 단위 발급 버튼 대신 체크박스로 발급 대상을 고르고, 상단 툴바의
 * 발급·재발급 버튼으로 일괄 신청한다. 3년 초과 등 발급 불가 행과
 * 선택 카테고리가 다른 행(발급 vs 재발급 혼합 방지)은 체크박스가 잠긴다.
 */
export function TrainingHistoryTable({
  items,
  selectedIds,
  isRowCheckable,
  onToggleRow,
  onToggleAll,
}: TrainingHistoryTableProps) {
  const checkableIds = items
    .filter((item) => isRowCheckable(item))
    .map((item) => item.id);
  const allSelected =
    checkableIds.length > 0 &&
    checkableIds.every((id) => selectedIds.includes(id));

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
      {/* 헤더 전체선택 — 체크 가능한 행만 토글 대상 */}
      <div className="flex w-full items-center border-b border-solid border-gray-200 bg-gray-100 px-4 py-3">
        <div className={cn('flex items-center', COLUMNS[0])}>
          <Checkbox
            size="s"
            aria-label="전체 선택"
            checked={allSelected}
            disabled={checkableIds.length === 0}
            onChange={() => onToggleAll()}
          />
        </div>
        {HEADER_LABELS.slice(1).map((label, index) => (
          <p
            key={label}
            className={cn(
              'font-sans text-sm font-semibold leading-normal text-gray-800',
              COLUMNS[index + 1],
            )}
          >
            {label}
          </p>
        ))}
      </div>

      {/* 본문 행 */}
      {items.map((item) => {
        const isDimmed = item.certificateStatus === 'unavailable';
        const textColor = isDimmed ? CELL_DIMMED : CELL_TEXT;
        const isSelected = selectedIds.includes(item.id);
        const isCheckable = isRowCheckable(item);

        return (
          <div
            key={item.id}
            className="flex w-full items-center border-b border-solid border-gray-200 bg-white p-4 last:border-b-0"
          >
            <div className={cn('flex items-center', COLUMNS[0])}>
              <Checkbox
                size="s"
                aria-label={`${item.courseName} 선택`}
                checked={isSelected}
                disabled={!isCheckable}
                onChange={() => onToggleRow(item.id)}
              />
            </div>

            <p className={cn(CELL_BASE, COLUMNS[1], textColor)}>
              {formatYMD(item.startedOn)}
            </p>
            <p className={cn(CELL_BASE, COLUMNS[2], textColor)}>
              {formatYMD(item.endedOn)}
            </p>
            <div className={cn('flex flex-col gap-1', COLUMNS[3])}>
              <p
                className={cn(
                  CELL_BASE,
                  'font-semibold',
                  isDimmed ? CELL_DIMMED : 'text-gray-900',
                )}
              >
                {item.courseName}
              </p>
              {/* 재발급 기한 — 교육명 아래 보조 표기 (node 104:5375) */}
              {item.certificateStatus === 'reissuable' && item.reissueDeadline && (
                <p className="text-xs leading-normal whitespace-nowrap text-gray-400">
                  {item.reissueDeadline}까지 재발급 가능
                </p>
              )}
            </div>
            <p className={cn(CELL_BASE, COLUMNS[4], textColor)}>{item.organizer}</p>
            <p className={cn(CELL_BASE, COLUMNS[5], textColor)}>{item.hours}시간</p>
          </div>
        );
      })}
    </div>
  );
}
