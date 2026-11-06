import { afterEach, describe, expect, it } from "vitest";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SearchableSelect, type SearchableOption } from "./searchable-select";

afterEach(cleanup);

const OPTIONS: SearchableOption[] = [
  { value: "c1", label: "안전보건교육", hint: "기관A" },
  { value: "c2", label: "감리원 보수교육", hint: "기관B" },
];

const fetchPage = async () => ({ items: OPTIONS, total: 2, page: 1, limit: 30, total_pages: 1 });

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** requestAnimationFrame 포커스 + 쿼리 resolve 를 흘려보낸다 */
const flush = () => act(() => new Promise((r) => setTimeout(r, 30)));

describe("SearchableSelect portal", () => {
  function renderInScrollBox(portal: boolean) {
    render(
      wrap(
        <div data-testid="scroll-box" style={{ overflow: "auto", maxHeight: 100 }}>
          <SearchableSelect
            value={null}
            onChange={() => {}}
            fetchPage={fetchPage}
            queryKeyPrefix={["t", String(portal)]}
            placeholder="과정 선택"
            disableCreate
            portal={portal}
          />
        </div>,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "과정 선택" }));
  }

  it("portal 이면 목록이 스크롤 컨테이너 밖(body)에 그려진다", async () => {
    renderInScrollBox(true);
    await flush();
    const option = await screen.findByText("안전보건교육");
    expect(screen.getByTestId("scroll-box").contains(option)).toBe(false);
  });

  it("portal 패널 안을 누르면 닫히지 않는다", async () => {
    renderInScrollBox(true);
    await flush();
    fireEvent.mouseDown(await screen.findByText("안전보건교육"));
    expect(screen.queryByText("안전보건교육")).not.toBeNull();
  });

  it("portal 이 아니면 기존처럼 컨테이너 안에 그려진다", async () => {
    renderInScrollBox(false);
    await flush();
    const option = await screen.findByText("안전보건교육");
    expect(screen.getByTestId("scroll-box").contains(option)).toBe(true);
  });
});

describe("SearchableSelect keepSearchText", () => {
  function Harness({ keep }: { keep: boolean }) {
    const [value, setValue] = useState<string | null>(null);
    const [label, setLabel] = useState<string | undefined>();
    return (
      <SearchableSelect
        value={value}
        onChange={(v, o) => {
          setValue(v);
          setLabel(o?.label);
        }}
        fetchPage={async () => ({ items: [], total: 0, page: 1, limit: 30, total_pages: 0 })}
        queryKeyPrefix={["keep", String(keep)]}
        placeholder="과정 검색"
        selectedLabel={label}
        onCreate={async (name) => `new-${name}`}
        keepSearchText={keep}
      />
    );
  }

  it("바깥 클릭으로 닫혀도 입력하던 과정명이 남는다", async () => {
    render(wrap(<Harness keep />));
    fireEvent.click(screen.getByRole("button", { name: "과정 검색" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), { target: { value: "건설안전 심화" } });
    fireEvent.mouseDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: "과정 검색" }));
    expect((screen.getByPlaceholderText("검색") as HTMLInputElement).value).toBe("건설안전 심화");
  });

  it("추가한 뒤 다시 열면 그 과정명이 검색창에 채워져 이어서 고칠 수 있다", async () => {
    render(wrap(<Harness keep />));
    fireEvent.click(screen.getByRole("button", { name: "과정 검색" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), { target: { value: "건설안젼" } });
    await act(async () => {
      fireEvent.click(screen.getByText(/새로 추가/));
    });
    fireEvent.click(screen.getByRole("button", { name: "건설안젼" }));
    await flush();
    expect((screen.getByPlaceholderText("검색") as HTMLInputElement).value).toBe("건설안젼");
  });

  it("keepSearchText 가 없으면 기존처럼 비워진다", () => {
    render(wrap(<Harness keep={false} />));
    fireEvent.click(screen.getByRole("button", { name: "과정 검색" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), { target: { value: "임시" } });
    fireEvent.mouseDown(document.body);
    fireEvent.click(screen.getByRole("button", { name: "과정 검색" }));
    expect((screen.getByPlaceholderText("검색") as HTMLInputElement).value).toBe("");
  });
});

describe("SearchableSelect 긴 라벨", () => {
  it("선택 라벨은 줄바꿈 대신 말줄임(truncate)된다", () => {
    render(
      wrap(
        <SearchableSelect
          value="t1"
          onChange={() => {}}
          fetchPage={fetchPage}
          queryKeyPrefix={["long"]}
          selectedLabel="홍길동 (제2026-000000000000000123호)"
        />,
      ),
    );
    const label = screen.getByText("홍길동 (제2026-000000000000000123호)");
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("min-w-0");
  });
});
