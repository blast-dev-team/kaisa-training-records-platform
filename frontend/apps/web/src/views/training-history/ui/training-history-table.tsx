import { Button } from '@/src/shared/ui';
import { cn } from '@/src/shared/utils/cn';

import type { TrainingHistoryItem } from '../api/get-training-history-list';

export interface TrainingHistoryTableProps {
  items: TrainingHistoryItem[];
  /** 발급 신청·재발급 클릭 — 페이지가 결제 모달 오픈을 담당한다 */
  onIssueClick?: (id: string) => void;
}

/** 표 헤더·본문 공용 열 폭 */
const COLUMNS = [
  'w-[120px] shrink-0', // 수강 시작일
  'w-[120px] shrink-0', // 수강 종료일
  'min-w-px flex-1', // 교육명
  'w-[150px] shrink-0', // 교육기관
  'w-[110px] shrink-0', // 교육 이수시간
  'w-[120px] shrink-0', // 확인서
] as const;

const HEADER_LABELS = [
  '수강 시작일',
  '수강 종료일',
  '교육명',
  '교육기관',
  '교육 이수시간',
  '확인서',
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
 * 공용 Table 컴포넌트(dense 12px 스펙, node 19:17689)와 이 화면의 스펙(14px ·
 * 사용자 정의 열폭)이 달라 페이지 전용으로 작성했다.
 * 3년 초과 등 발급 불가 행은 전체 텍스트가 gray-400으로 어둡게(비활성) 표시된다.
 */
export function TrainingHistoryTable({ items, onIssueClick }: TrainingHistoryTableProps) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-solid border-gray-200">
      {/* 헤더 행 — gray-100 배경 + SemiBold 14px gray-800 */}
      <div className="flex w-full items-start border-b border-solid border-gray-200 bg-gray-100 px-4 py-3">
        {HEADER_LABELS.map((label, index) => (
          <p
            key={label}
            className={cn(
              'font-sans text-sm font-semibold leading-normal text-gray-800',
              COLUMNS[index],
              index === 5 && 'text-center',
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

        return (
          <div
            key={item.id}
            className="flex w-full items-center border-b border-solid border-gray-200 bg-white px-4 py-4 last:border-b-0"
          >
            <p className={cn(CELL_BASE, COLUMNS[0], textColor)}>
              {formatYMD(item.startedOn)}
            </p>
            <p className={cn(CELL_BASE, COLUMNS[1], textColor)}>
              {formatYMD(item.endedOn)}
            </p>
            <p
              className={cn(
                CELL_BASE,
                COLUMNS[2],
                'font-semibold',
                isDimmed ? CELL_DIMMED : 'text-gray-900',
              )}
            >
              {item.courseName}
            </p>
            <p className={cn(CELL_BASE, COLUMNS[3], textColor)}>{item.organizer}</p>
            <p className={cn(CELL_BASE, COLUMNS[4], textColor)}>{item.hours}시간</p>

            {/* 확인서 — 발급 신청(primary) / 재발급(outline+기한) / 발급 불가(disabled) */}
            <div className={cn('flex items-center justify-center', COLUMNS[5])}>
              {item.certificateStatus === 'issuable' && (
                <Button
                  size="s"
                  className="rounded-md px-3 py-1.5 text-[13px]"
                  onClick={() => onIssueClick?.(item.id)}
                >
                  발급 신청
                </Button>
              )}
              {item.certificateStatus === 'reissuable' && (
                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="outlined"
                    color="gray"
                    size="s"
                    className="rounded-md border-gray-300 px-3 py-1.5 text-[13px] text-gray-700"
                    onClick={() => onIssueClick?.(item.id)}
                  >
                    재발급
                  </Button>
                  <p className="text-xs leading-normal whitespace-nowrap text-gray-400">
                    {item.reissueDeadline}
                  </p>
                </div>
              )}
              {item.certificateStatus === 'unavailable' && (
                <Button
                  variant="outlined"
                  size="s"
                  disabled
                  className="rounded-md px-3 py-1.5 text-[13px] disabled:border-gray-300 disabled:text-gray-400"
                >
                  발급 불가
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
