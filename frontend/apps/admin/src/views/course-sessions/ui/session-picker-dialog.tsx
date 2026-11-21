import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { SearchInput } from "@/src/shared/ui/search-input";
import { courseSessionQueries, type CourseSession } from "@/src/entities/course-session";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 일정 선택 시 호출 — 선택 즉시 닫힌다 */
  onSelect: (session: CourseSession) => void;
}

/** 교육 일정 선택기 — 역방향 등록(이력 관리)에서 일정을 고르면 과정·기관·기간이 자동 결정된다 */
export function SessionPickerDialog({ isOpen, onClose, onSelect }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearchInput("");
    setSearch("");
  }, [isOpen]);

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    ...courseSessionQueries.infiniteList({ q: search || undefined, limit: 30 }),
    enabled: isOpen,
  });
  const sessions = data?.pages.flatMap((p) => p.items) ?? [];

  // 목록 끝 근처까지 스크롤하면 다음 페이지 — 예전엔 첫 30건만 보여 오래된 일정은 검색해야만 찾을 수 있었다
  const onScroll = () => {
    const el = listRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) fetchNextPage();
  };

  // 첫 페이지가 목록 높이를 다 못 채우면 스크롤이 생기지 않아 다음 페이지를 못 부른다 — 채워질 때까지 이어 부른다
  useEffect(() => {
    const el = listRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollHeight <= el.clientHeight) fetchNextPage();
  }, [data, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="교육 일정 선택"
      description="일정을 고르면 과정·기관·기간이 자동으로 채워져요"
      actions={[{ label: "닫기", onClick: onClose }]}
    >
      <div className="space-y-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <SearchInput
            className="flex-1"
            placeholder="과정명 · 기관명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onClear={() => setSearch('')}
          />
          <Button type="submit" variant="secondary" size="sm">
            검색
          </Button>
        </form>
        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-72 overflow-y-auto rounded-md border border-line"
        >
          {!isLoading && sessions.length === 0 && (
            <p className="p-3 text-13 text-ink-3">
              검색 결과가 없어요. 일정은 교육 일정 관리에서 먼저 등록해 주세요
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-bg-2"
              onClick={() => {
                onSelect(s);
                onClose();
              }}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-13 font-medium text-ink">{s.courseName}</span>
                <span className="text-11 text-ink-3">
                  {s.institutionName} · {s.startedAt ?? "기간 미정"}
                  {s.endedAt ? ` ~ ${s.endedAt}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-11 text-ink-3">
                수강생 {s.enrolledCount.toLocaleString()}명
              </span>
            </button>
          ))}
          {isFetchingNextPage && (
            <p className="p-2 text-center text-12 text-ink-3">일정을 더 불러오고 있어요</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
