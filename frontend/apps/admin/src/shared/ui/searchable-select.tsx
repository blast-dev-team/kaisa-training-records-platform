import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { apiClient, type PagedResponse } from "@/src/shared/api";
import { useDebouncedValue } from "@/src/shared/hooks/use-debounced-value";

export interface SearchableOption {
  value: string;
  label: string;
  /** 옵션 우측 보조 텍스트 (예: 기관명) */
  hint?: string;
}

interface Props {
  value: string | null;
  onChange: (value: string | null, option?: SearchableOption) => void;
  /** 검색어 → 페이지 응답. 무한 스크롤 소스 */
  fetchPage: (search: string, page: number) => Promise<PagedResponse<SearchableOption>>;
  placeholder?: string;
  /** true 면 "선택 취소" 항목 표시 */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  queryKeyPrefix: string[];
  /** 옵션 로드 전에도 표시할 선택값 라벨 (수정 화면 — 목록에 없어도 보이게) */
  selectedLabel?: string;
  /**
   * 검색 결과에 없는 값을 새로 만들 때 — 지정하면 'X 새로 추가' 항목이 보인다.
   * 만든 뒤 선택할 값(id 등)을 반환. 없으면 검색어 자체를 값으로 사용(자유 입력).
   */
  onCreate?: (name: string) => Promise<string | null>;
  createLabel?: (search: string) => string;
}

/**
 * 검색 + 무한 스크롤 커스텀 드롭다운.
 * 클릭하면 펼쳐지고, 검색어 입력 시 목록이 바뀌며, 스크롤 끝에서 다음 페이지를 불러온다.
 */
export function SearchableSelect({
  value,
  onChange,
  fetchPage,
  placeholder = "선택",
  clearable = false,
  disabled = false,
  className = "",
  emptyMessage = "검색 결과가 없어요",
  queryKeyPrefix,
  selectedLabel,
  onCreate,
  createLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    queryKey: [...queryKeyPrefix, debouncedSearch],
    queryFn: ({ pageParam }) => fetchPage(debouncedSearch, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const totalPages = Math.ceil(last.total / last.limit);
      return last.page < totalPages ? last.page + 1 : undefined;
    },
    enabled: open,
  });

  const options = query.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // 스크롤 끝 도달 → 다음 페이지
  const onScroll = () => {
    const el = listRef.current;
    if (!el || !query.hasNextPage || query.isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      query.fetchNextPage();
    }
  };

  const currentLabel =
    options.find((o) => o.value === value)?.label ??
    (value ? (selectedLabel ?? "•••") : null);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-white px-3 text-[13px] text-ink disabled:cursor-not-allowed disabled:bg-bg-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={currentLabel ? "" : "text-ink-3"}>
          {currentLabel ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-3.5 shrink-0 text-ink-3" />
            <input
              autoFocus
              className="w-full text-[13px] outline-none placeholder:text-ink-3"
              placeholder="검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto" onScroll={onScroll}>
            {clearable && (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-[13px] text-ink-3 hover:bg-bg-2"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                선택 취소
              </button>
            )}
            {!query.isPending && options.length === 0 && !onCreate && (
              <p className="p-3 text-[13px] text-ink-3">{emptyMessage}</p>
            )}
            {search.trim() !== "" && (
              <button
                type="button"
                disabled={creating}
                className="flex w-full items-center gap-1.5 border-b border-line px-3 py-2 text-left text-[13px] text-accent hover:bg-bg-2 disabled:text-ink-3"
                onClick={async () => {
                  if (onCreate) {
                    setCreating(true);
                    const created = await onCreate(search.trim());
                    setCreating(false);
                    if (created === null) return;
                    onChange(created);
                  } else {
                    // 자유 입력 값 — 분류·과정코드처럼 마스터 없이 텍스트로 쓰는 속성
                    onChange(search.trim(), {
                      value: search.trim(),
                      label: search.trim(),
                    });
                  }
                  setOpen(false);
                  setSearch("");
                }}
              >
                +{" "}
                {createLabel ? createLabel(search.trim()) : `'${search.trim()}' 새로 추가`}
              </button>
            )}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-bg-2 ${
                  o.value === value ? "bg-accent-soft" : ""
                }`}
                onClick={() => {
                  onChange(o.value, o);
                  setOpen(false);
                }}
              >
                <span className="truncate text-ink">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 text-[11px] text-ink-3">{o.hint}</span>
                )}
              </button>
            ))}
            {query.isFetchingNextPage && (
              <p className="p-2 text-center text-[12px] text-ink-3">불러오는 중…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** API paged 응답을 옵션 페이지로 변환하는 헬퍼 */
export function fetchOptions(
  path: string,
  params: Record<string, unknown>,
  map: (row: Record<string, unknown>) => SearchableOption,
): (search: string, page: number) => Promise<PagedResponse<SearchableOption>> {
  return async (search, page) => {
    const { data } = await apiClient.get<PagedResponse<Record<string, unknown>>>(path, {
      params: { search: search || undefined, page, limit: 30, ...params },
    });
    return {
      items: data.items.map(map),
      total: data.total,
      page: data.page,
      limit: data.limit,
      total_pages: data.total_pages,
    };
  };
}
