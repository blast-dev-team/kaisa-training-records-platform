import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
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
  const page = 1;

  useEffect(() => {
    if (!isOpen) return;
    setSearchInput("");
    setSearch("");
  }, [isOpen]);

  const { data, isLoading } = useQuery(
    courseSessionQueries.list({ q: search || undefined, page, limit: 30 }),
  );
  const sessions = data?.items ?? [];

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
          <Input
            className="flex-1"
            placeholder="과정명 · 기관명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm">
            검색
          </Button>
        </form>
        <div className="max-h-72 overflow-y-auto rounded-md border border-line">
          {!isLoading && sessions.length === 0 && (
            <p className="p-3 text-[13px] text-ink-3">
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
                <span className="truncate text-[13px] font-medium text-ink">{s.courseName}</span>
                <span className="text-[11px] text-ink-3">
                  {s.institutionName} · {s.startedAt ?? "기간 미정"}
                  {s.endedAt ? ` ~ ${s.endedAt}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-ink-3">
                수강생 {s.enrolledCount.toLocaleString()}명
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
