import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Search, X } from "lucide-react";
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
  /** true 면 '+ 새로 추가' 자유입력 행을 숨긴다 — 마스터에서 선택만 하는 용도 */
  disableCreate?: boolean;
  /**
   * true 면 드롭다운을 document.body 포털(fixed)로 띄운다.
   * 스크롤/overflow 로 잘리는 컨테이너(모달 안 테이블 등) 안에서 써도 밖으로 펼쳐진다.
   */
  portal?: boolean;
  /**
   * true 면 입력하던 검색어를 유지한다 — 바깥 클릭으로 닫혀도 지우지 않고,
   * 선택값이 있는 상태로 다시 열면 현재 라벨을 검색창에 채워 이어서 고칠 수 있게 한다.
   */
  keepSearchText?: boolean;
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
  disableCreate = false,
  portal = false,
  keepSearchText = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);

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
      if (!keepSearchText) setSearch("");
      return;
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // 포털 패널은 container 밖(body)에 있으므로 따로 확인한다
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
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

  // 포털 모드 — 트리거 위치를 따라 fixed 로 배치. 아래 공간이 부족하면 위로 펼친다
  useLayoutEffect(() => {
    if (!open || !portal) {
      setPortalStyle(null);
      return;
    }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const PANEL_MAX = 300; // 검색줄 + 목록(max-h-56) 대략치
      const below = window.innerHeight - r.bottom;
      const openUp = below < PANEL_MAX && r.top > below;
      setPortalStyle({
        position: "fixed",
        left: r.left,
        width: r.width,
        ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    place();
    // 모달 본문·테이블 스크롤에도 따라가도록 capture 로 듣는다
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, portal]);

  // 열릴 때 검색창 포커스 — keepSearchText 면 현재 라벨을 채우고 전체 선택(바로 덮어쓰기·이어 고치기 둘 다 가능)
  useEffect(() => {
    if (!open) return;
    if (keepSearchText && search === "" && value && currentLabel && currentLabel !== "•••") {
      setSearch(currentLabel);
    }
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      if (keepSearchText) searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
    // 열리는 순간에만 — search/label 변화로 다시 돌지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeAfterSelect = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-white px-3 text-14 text-ink disabled:cursor-not-allowed disabled:bg-bg-2"
        onClick={() => setOpen((v) => !v)}
        title={currentLabel ?? undefined}
      >
        {/* 긴 라벨(이름 + 증번호 등)은 줄바꿈 대신 말줄임 */}
        <span className={`min-w-0 truncate ${currentLabel ? "" : "text-ink-3"}`}>
          {currentLabel ?? placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </button>

      {open && (!portal || portalStyle !== null) && renderPanel()}
    </div>
  );

  function renderPanel() {
    const panel = (
        <div
          ref={panelRef}
          className={
            portal
              ? "z-[1200] rounded-md border border-line bg-white shadow-lg"
              : "absolute z-30 mt-1 w-full rounded-md border border-line bg-white shadow-lg"
          }
          style={portal ? (portalStyle ?? undefined) : undefined}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-3.5 shrink-0 text-ink-3" />
            <input
              ref={searchInputRef}
              className="w-full text-14 outline-none placeholder:text-ink-3"
              placeholder="검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search !== "" && (
              <button
                type="button"
                aria-label="검색어 지우기"
                className="shrink-0 rounded-full p-0.5 text-ink-3 hover:bg-bg-2 hover:text-ink"
                onClick={() => setSearch("")}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto" onScroll={onScroll}>
            {clearable && (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-14 text-ink-3 hover:bg-bg-2"
                onClick={() => {
                  onChange(null);
                  closeAfterSelect();
                }}
              >
                선택 취소
              </button>
            )}
            {!query.isPending && options.length === 0 && !onCreate && (
              <p className="p-3 text-14 text-ink-3">{emptyMessage}</p>
            )}
            {!disableCreate && search.trim() !== "" && (
              <button
                type="button"
                disabled={creating}
                className="flex w-full items-center gap-1.5 border-b border-line px-3 py-2 text-left text-14 text-accent hover:bg-bg-2 disabled:text-ink-3"
                onClick={async () => {
                  if (onCreate) {
                    setCreating(true);
                    const created = await onCreate(search.trim());
                    setCreating(false);
                    if (created === null) return;
                    // 생성값도 option 으로 넘긴다 — 소비자가 트리거 라벨을 만들 수 있게 (없으면 ••• 로 보임)
                    onChange(created, { value: created, label: search.trim() });
                  } else {
                    // 자유 입력 값 — 분류·과정코드처럼 마스터 없이 텍스트로 쓰는 속성
                    onChange(search.trim(), {
                      value: search.trim(),
                      label: search.trim(),
                    });
                  }
                  closeAfterSelect();
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
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-14 hover:bg-bg-2 ${
                  o.value === value ? "bg-accent-soft" : ""
                }`}
                onClick={() => {
                  onChange(o.value, o);
                  closeAfterSelect();
                }}
                title={o.hint ? `${o.label} · ${o.hint}` : o.label}
              >
                <span className="min-w-0 truncate text-ink">{o.label}</span>
                {o.hint && (
                  <span className="max-w-[60%] shrink-0 truncate text-11 text-ink-3">
                    {o.hint}
                  </span>
                )}
              </button>
            ))}
            {query.isFetchingNextPage && (
              <p className="p-2 text-center text-12 text-ink-3">불러오는 중…</p>
            )}
          </div>
        </div>
    );
    return portal ? createPortal(panel, document.body) : panel;
  }
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
