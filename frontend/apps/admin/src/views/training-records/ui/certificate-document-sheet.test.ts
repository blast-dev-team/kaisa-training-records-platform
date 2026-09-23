import { describe, expect, it } from "vitest";

import {
  paginateRows,
  ROWS_PER_LAST_PAGE,
  type CertificateSheetRow,
} from "./certificate-document-sheet";

/** n행짜리 더미 — hours를 연번과 같게 해 합계 검증을 쉽게 */
function rows(n: number): CertificateSheetRow[] {
  return Array.from({ length: n }, (_, i) => ({
    institutionName: null,
    courseName: `교육 ${i + 1}`,
    trainedOn: "2026-01-01",
    hours: i + 1,
  }));
}

function sumHours(pages: { rows: (CertificateSheetRow | null)[] }[]): number {
  return pages
    .flatMap((page) => page.rows)
    .reduce((sum, row) => sum + (row?.hours ?? 0), 0);
}

describe("paginateRows", () => {
  it("용량 이하면 한 장(머리+마감)으로 나온다", () => {
    const pages = paginateRows(rows(ROWS_PER_LAST_PAGE));
    expect(pages).toHaveLength(1);
    expect(pages[0]!).toMatchObject({ startNo: 1, showHead: true, showClosing: true });
  });

  it("단일 문서는 빈 행으로 1장을 가득 채운다", () => {
    const pages = paginateRows(rows(3));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.rows).toHaveLength(ROWS_PER_LAST_PAGE);
    expect(pages[0]!.rows.slice(0, 3).every((row) => row !== null)).toBe(true);
    expect(pages[0]!.rows.slice(3).every((row) => row === null)).toBe(true);
  });

  it("8행은 마지막 페이지 최소 1행을 남겨 7+1로 나뉜다", () => {
    const pages = paginateRows(rows(8));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.rows).toHaveLength(7);
    expect(pages[1]!).toMatchObject({ startNo: 8, showClosing: true });
    expect(pages[1]!.rows).toHaveLength(1);
  });

  it("용량 초과 시 1페이지는 머리만, 마감은 마지막 페이지에 온다", () => {
    const pages = paginateRows(rows(12));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.showHead).toBe(true);
    expect(pages[0]!.showClosing).toBe(false);
    expect(pages[1]!).toMatchObject({ startNo: 12, showHead: false, showClosing: true });
    expect(pages[1]!.rows).toHaveLength(1);
  });

  it("연번이 페이지 사이에서 이어진다", () => {
    const pages = paginateRows(rows(28));
    let no = 1;
    for (const page of pages) {
      expect(page.startNo).toBe(no);
      no += page.rows.filter((row) => row !== null).length;
    }
    expect(no - 1).toBe(28);
  });

  it("머리는 첫 페이지, 마감은 마지막 페이지에만 있고 마지막 페이지는 용량을 넘지 않는다", () => {
    for (const n of [12, 16, 17, 27, 28, 40, 45]) {
      const pages = paginateRows(rows(n));
      expect(pages.filter((page) => page.showHead)).toHaveLength(1);
      expect(pages.filter((page) => page.showClosing)).toHaveLength(1);
      expect(pages[pages.length - 1]!.showClosing).toBe(true);
      expect(pages[pages.length - 1]!.rows.length).toBeLessThanOrEqual(ROWS_PER_LAST_PAGE);
      expect(sumHours(pages)).toBe((n * (n + 1)) / 2);
    }
  });
});
