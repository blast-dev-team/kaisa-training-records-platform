// 확인서 표 — 외부교육 상단 정렬 + 외부 합계 16시간 초과 시 시간 칸 병합 (2026-11-20)
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import {
  CertificateDocumentSheet,
  externalFirst,
  externalHoursMerge,
  paginateRows,
  ROWS_PER_FIRST_PAGE,
  type CertificateSheetRow,
} from "./certificate-document-sheet";

const row = (name: string, hours: number, isExternal: boolean): CertificateSheetRow => ({
  institutionName: isExternal ? "외부기관" : "협회",
  courseName: name,
  trainedOn: "2026-01-01",
  hours,
  isExternal,
});

/** 렌더된 시트의 데이터 행별 "교육시간" 칸 텍스트 — 병합으로 칸이 없는 행은 null */
function hoursColumn(container: HTMLElement): (string | null)[] {
  const out: (string | null)[] = [];
  container.querySelectorAll("tbody tr").forEach((tr) => {
    const tds = [...tr.querySelectorAll("td")];
    const no = tds[0]?.textContent ?? "";
    if (!/^\d+$/.test(no)) return; // 머리·합계 행 제외
    const hoursTd = tds.length >= 5 ? tds[4] : null;
    out.push(hoursTd ? `${hoursTd.textContent}|span${hoursTd.getAttribute("rowspan") ?? "1"}` : null);
  });
  return out;
}

function sheet(rows: (CertificateSheetRow | null)[], opts: { startNo?: number; capped: boolean }) {
  return render(
    <CertificateDocumentSheet
      rows={rows}
      startNo={opts.startNo ?? 1}
      externalCapped={opts.capped}
      showHead={false}
      showClosing={false}
      memberName="홍길동"
    />,
  ).container;
}

describe("외부교육 상단 정렬", () => {
  it("외부 행을 위로, 같은 구분 안에서는 선택 순서 유지", () => {
    const sorted = externalFirst([
      row("사내1", 4, false),
      row("외부1", 2, true),
      row("사내2", 3, false),
      row("외부2", 7, true),
    ]);
    expect(sorted.map((r) => r.courseName)).toEqual(["외부1", "외부2", "사내1", "사내2"]);
  });
});

describe("외부 합계 16시간 이하 — 기존처럼 행별 시간", () => {
  it("병합하지 않고 2·4·7시간을 그대로 쓴다", () => {
    const rows = externalFirst([row("사내", 3, false), row("외부A", 2, true), row("외부B", 4, true), row("외부C", 7, true)]);
    const c = sheet(rows, { capped: false });
    expect(hoursColumn(c)).toEqual(["2시간|span1", "4시간|span1", "7시간|span1", "3시간|span1"]);
  });
});

describe("외부 합계 16시간 초과 — 외부 행 시간 칸을 합쳐 16시간", () => {
  it("한 페이지: 외부 행만 병합해 16시간, 사내 행은 자기 시간", () => {
    const rows = externalFirst([row("사내", 3, false), row("외부A", 8, true), row("외부B", 6, true), row("외부C", 7, true)]);
    const c = sheet(rows, { capped: true });
    expect(hoursColumn(c)).toEqual(["16시간|span3", null, null, "3시간|span1"]);
  });

  it("여러 페이지: 1페이지만 16시간, 이어지는 페이지의 외부 행은 병합하고 비운다", () => {
    const externals = Array.from({ length: 13 }, (_, i) => row(`외부${i + 1}`, 2, true));
    const internals = Array.from({ length: 3 }, (_, i) => row(`사내${i + 1}`, 4, false));
    const rows = externalFirst([...internals, ...externals]);
    const pages = paginateRows(rows);
    expect(pages.length).toBeGreaterThan(1);

    // 1페이지 — 외부 10행이 한 칸으로, "16시간"
    const first = externalHoursMerge(pages[0]!.rows, pages[0]!.startNo);
    expect(first).toEqual({ start: 0, span: ROWS_PER_FIRST_PAGE, showLabel: true });
    expect(hoursColumn(sheet(pages[0]!.rows, { startNo: pages[0]!.startNo, capped: true }))[0]).toBe(
      `16시간|span${ROWS_PER_FIRST_PAGE}`,
    );

    // 2페이지 — 남은 외부 3행은 병합하되 빈 칸, 사내 행은 자기 시간
    const second = pages[1]!;
    const merge = externalHoursMerge(second.rows, second.startNo);
    expect(merge).toEqual({ start: 0, span: 3, showLabel: false });
    const col = hoursColumn(sheet(second.rows, { startNo: second.startNo, capped: true }));
    expect(col.slice(0, 6)).toEqual(["|span3", null, null, "4시간|span1", "4시간|span1", "4시간|span1"]);
  });

  it("외부 행이 없는 페이지는 병합 없음", () => {
    expect(externalHoursMerge([row("사내", 4, false), null], 12)).toBeNull();
  });

  it("빈 채움 행(null)은 병합 범위에 넣지 않는다", () => {
    const rows = [row("외부A", 10, true), row("외부B", 9, true), null, null];
    expect(externalHoursMerge(rows, 1)).toEqual({ start: 0, span: 2, showLabel: true });
  });
});
