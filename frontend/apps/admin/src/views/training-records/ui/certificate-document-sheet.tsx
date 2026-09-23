import type { CSSProperties } from "react";

import associationSeal from "@/src/assets/association-seal.png";

export interface CertificateSheetRow {
  /** 교육기관명 */
  institutionName: string | null;
  /** 교육명 */
  courseName: string;
  /** 교육기간 (YYYY-MM-DD) */
  trainedOn: string;
  /** 교육시간 */
  hours: number;
}

/** 이력 행 → 서식 행 스냅샷 (WEB 상세와 같은 매핑 — 시간은 total_hours 기준) */
export function toSheetRows(
  records: {
    institutionName: string | null;
    courseName: string;
    startedAt: string | null;
    endedAt: string | null;
    totalHours: number | null;
    completedHours: number | null;
  }[],
): CertificateSheetRow[] {
  return records.map((record) => ({
    institutionName: record.institutionName,
    courseName: record.courseName,
    trainedOn: record.startedAt ?? record.endedAt ?? "",
    hours: record.totalHours ?? record.completedHours ?? 0,
  }));
}

/** 발급일 표시문 — 2026년 9월 21일 */
export function formatIssuedOnLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** 서식 행 용량 — 실측: 고정부(제목 96+신청인 48×2+섹션 48+헤더 48)=288px.
 * 1페이지(머리만, 마감 없음): (1123 − 72 − 288) / 64 = 11.9 → 11행 */
export const ROWS_PER_FIRST_PAGE = 11;
/** 계속 페이지(행만): (1051) / 64 = 16, 4줄 이름 여유로 15 */
export const ROWS_PER_CONT_PAGE = 15;
/** 마지막 페이지(합계 52 + 증명 210 포함): (1051 − 52 − 211) / 64 = 7.8 → 7행.
 * 11행으로 잡으면 페이지가 204px 넘쳐 미리보기·PDF 하단이 잘린다 */
export const ROWS_PER_LAST_PAGE = 7;

/** 확인서 1페이지 — 행 묶음과 머리(제목·신청인)·마감(합계·증명) 표시 여부 */
export interface CertificateSheetPage {
  rows: (CertificateSheetRow | null)[];
  /** 이 페이지 첫 행의 연번 */
  startNo: number;
  /** 서식번호·문서번호 + 제목 + 신청인 + 컬럼헤더 */
  showHead: boolean;
  /** 합계 + 증명문구·발급일·협회장·인감 */
  showClosing: boolean;
}

/**
 * 서식 행을 문서 페이지로 나눈다 — 협회 발급 문서와 같은 연속 문서.
 *
 * 7행 이하는 한 장(머리+마감), 넘으면 1페이지에 머리+행만 담고 행은 계속
 * 페이지로 이어지며 합계·증명·인감은 마지막 페이지에만 온다. 계속 페이지를
 * 채울 때 마지막 페이지 용량을 남겨 둔다 — 마지막 페이지가 용량(7행)을
 * 넘지 않게 take = min(계속 용량, rest − 마지막 용량).
 */
export function paginateRows(rows: CertificateSheetRow[]): CertificateSheetPage[] {
  if (rows.length <= ROWS_PER_LAST_PAGE) {
    // 단일 문서는 1장을 가득 채운다 — 남는 칸은 빈 행(공백 서식과 같은 모양)
    return [
      {
        rows: [...rows, ...Array.from({ length: ROWS_PER_LAST_PAGE - rows.length }, () => null)],
        startNo: 1,
        showHead: true,
        showClosing: true,
      },
    ];
  }

  // 마지막 페이지(마감 포함)에 최소 1행을 남긴다 — 8행 문서도 7+1로 나뉜다
  const firstCount = Math.min(ROWS_PER_FIRST_PAGE, rows.length - 1);
  const pages: CertificateSheetPage[] = [
    { rows: rows.slice(0, firstCount), startNo: 1, showHead: true, showClosing: false },
  ];

  let startNo = 1 + firstCount;
  let rest = rows.slice(firstCount);
  while (rest.length > 0) {
    if (rest.length <= ROWS_PER_LAST_PAGE) {
      pages.push({ rows: rest, startNo, showHead: false, showClosing: true });
      rest = [];
    } else {
      const take = Math.min(ROWS_PER_CONT_PAGE, rest.length - ROWS_PER_LAST_PAGE);
      pages.push({ rows: rest.slice(0, take), startNo, showHead: false, showClosing: false });
      startNo += take;
      rest = rest.slice(take);
    }
  }
  return pages;
}

export interface CertificateDocumentSheetProps {
  /** 교육내역 행 — 이 페이지의 행. 단일 문서는 paginateRows가 빈 행으로 채운다 */
  rows: (CertificateSheetRow | null)[];
  /** 문서 전체 총 이수시간 — 마감 합계 표기. 기본은 이 페이지 rows 합 */
  totalHours?: number;
  /** 문서 머리(서식·문서번호·제목·신청인·컬럼헤더) — 계속 페이지에서 생략 */
  showHead?: boolean;
  /** 마감(합계·증명문구·도장) — 마지막 페이지에서만 */
  showClosing?: boolean;
  /** 신청인 — 교육생 성명 */
  memberName: string;
  /** 감리원 등급 — 신청인 칸 표기 */
  supervisorGrade?: string | null;
  /** 감리원증 발급번호 — 신청인 칸 표기 */
  supervisorCertNo?: string | null;
  /** 서식번호 (예: 제31호) — 좌측 상단 표기 */
  formNo?: string | null;
  /** 문서번호 — 우측 상단 표기 */
  docNo?: string | null;
  /** 발급일 표시문 (예: 2026년 7월 23일) */
  issuedOnLabel?: string;
  /** 이 페이지 첫 행의 연번 (2페이지부터 이어지는 번호) */
  startNo?: number;
}

const LINE = "1px solid #000";

/** A4 @96dpi — PDF 1페이지와 1:1 대응 */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const CONTENT_WIDTH = 700;

/**
 * 표 폭을 35px 기본 칸 20개로 쪼개 각 행을 colSpan 조합으로 구성한다.
 * 행마다 칸 경계가 어긋나는 그리드를 단일 table(borderSpacing: 0)로
 * 그리기 위함 — 중첩 테이블을 쓰면 경계선이 겹쳐 두꺼워진다.
 */
const COLS = 20;

/** 공문서 서체 — 캔버스 렌더는 브라우저가 하므로 시스템 설치 폰트를 그대로 쓴다 */
const DOC_FONT = `"Batang", "바탕", "BatangChe", "AppleMyungjo", serif`;

const cell: CSSProperties = {
  textAlign: "center",
  verticalAlign: "middle",
  padding: "0 8px",
  // Batang 기본 줄간(~1.6)은 3줄 이름이 64px 행을 넘게 한다 — 1.45로 3줄=61px 수용
  lineHeight: 1.45,
};

/**
 * 표 선 — 각 변을 정확히 한 번만 그린다 (오른쪽·아래는 모든 칸, 위·왼쪽은 가장자리 칸만).
 *
 * border-collapse: collapse 는 브라우저가 공유 경계를 한 번만 그리지만
 * html2canvas 는 셀마다 경계를 각자 래스터화해 일부 경계가 두 배로 굵어진다
 * (PDF에서 선 몇 개만 굵게 보이는 원인). separate + 변 1회 배치로
 * 화면·PDF·인쇄가 모두 같은 1px 선을 내게 한다.
 */
function lineStyle(edge: { top?: boolean; left?: boolean }): CSSProperties {
  return {
    ...(edge.top ? { borderTop: LINE } : null),
    ...(edge.left ? { borderLeft: LINE } : null),
    borderRight: LINE,
    borderBottom: LINE,
  };
}

/** 시간 합계 표기 — 8.0 → "8", 7.5 → "7.5" */
function formatHours(hours: number): string {
  return String(Number.isInteger(hours) ? hours : Number(hours.toFixed(1)));
}

/**
 * 계속교육내역 확인서 — 별지 제31호 서식 레이아웃.
 *
 * WEB 앱과 같은 서식. 교육내역 행을 여러 건 받아 paginateRows로 페이지를
 * 나눠 연번을 이어주고, 합계·증명·인감은 마지막 페이지에만 온다.
 *
 * PDF 생성(html2canvas-pro)과 인쇄 양쪽에서 같은 모양을 내기 위해
 * Tailwind 클래스 없이 inline style(px·hex)만 사용한다.
 */
export function CertificateDocumentSheet({
  rows,
  totalHours: documentTotalHours,
  showHead = true,
  showClosing = true,
  memberName,
  supervisorGrade,
  supervisorCertNo,
  formNo,
  docNo,
  issuedOnLabel,
  startNo = 1,
}: CertificateDocumentSheetProps) {
  // 마감 합계는 문서 전체 합계 — 페이지 합이 아니다. prop이 없으면(단일 페이지) rows 합
  const closingHours = documentTotalHours ?? rows.reduce((sum, row) => sum + (row?.hours ?? 0), 0);

  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        boxSizing: "border-box",
        padding: "36px 47px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: DOC_FONT,
      }}
    >
      {/* 표를 페이지 세로 중앙에 배치 — 위아래 스페이서 대칭. 계속 페이지는 상단 정렬 */}
      {showHead && <div style={{ flex: 1 }} />}

      {/* 서식·문서번호 — 표 바깥 상단. 표와 함께 세로 중앙에 배치된다 */}
      {showHead && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            marginBottom: 6,
          }}
        >
          <span>[별지] {formNo ?? ""} 서식</span>
          <span>{docNo ?? ""}</span>
        </div>
      )}

      <table
        style={{
          width: CONTENT_WIDTH,
          borderCollapse: "separate",
          borderSpacing: 0,
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          {Array.from({ length: COLS }, (_, index) => (
            <col key={index} style={{ width: CONTENT_WIDTH / COLS }} />
          ))}
        </colgroup>
        <tbody>
          {showHead && (
            <>
              <tr>
                <td
                  colSpan={COLS}
                  style={{ height: 96, ...lineStyle({ top: true, left: true }), ...cell }}
                >
                  <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6 }}>
                    계속교육내역 확인서
                  </span>
                </td>
              </tr>
              <tr>
                <td
                  colSpan={3}
                  style={{ height: 48, ...lineStyle({ left: true }), ...cell, fontSize: 14 }}
                >
                  신청인
                </td>
                <td colSpan={3} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                  성&nbsp;&nbsp;명
                </td>
                <td colSpan={14} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                  {memberName}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={3}
                  style={{ height: 48, ...lineStyle({ left: true }), ...cell, fontSize: 14 }}
                >
                  감리원 등급
                </td>
                <td colSpan={5} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                  {supervisorGrade ?? ""}
                </td>
                <td colSpan={5} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                  감리원증 발급번호
                </td>
                <td colSpan={7} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                  {supervisorCertNo ?? ""}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={COLS}
                  style={{ height: 48, ...lineStyle({ left: true }), ...cell, fontSize: 15 }}
                >
                  계속교육내역 (최근 3년간)
                </td>
              </tr>
              <tr>
                <td
                  colSpan={2}
                  style={{ height: 48, ...lineStyle({ left: true }), ...cell, fontSize: 15 }}
                >
                  연번
                </td>
                <td colSpan={4} style={{ ...lineStyle({}), ...cell, fontSize: 15 }}>
                  교육기관명
                </td>
                <td colSpan={8} style={{ ...lineStyle({}), ...cell, fontSize: 15 }}>
                  교육명
                </td>
                <td colSpan={3} style={{ ...lineStyle({}), ...cell, fontSize: 15 }}>
                  교육기간
                </td>
                <td colSpan={3} style={{ ...lineStyle({}), ...cell, fontSize: 15 }}>
                  교육시간
                </td>
              </tr>
            </>
          )}
          {rows.map((row, index) => (
            <tr key={index}>
              <td
                colSpan={2}
                style={{
                  height: 64,
                  ...lineStyle({ left: true, top: index === 0 && !showHead }),
                  ...cell,
                }}
              >
                {row ? startNo + index : ""}
              </td>
              <td colSpan={4} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                {row?.institutionName ?? ""}
              </td>
              <td colSpan={8} style={{ ...lineStyle({}), ...cell, fontSize: 14 }}>
                {row?.courseName ?? ""}
              </td>
              <td colSpan={3} style={{ ...lineStyle({}), ...cell }}>
                {row ? row.trainedOn.replaceAll("-", ".") : ""}
              </td>
              <td colSpan={3} style={{ ...lineStyle({}), ...cell }}>
                {row ? `${formatHours(row.hours)}시간` : ""}
              </td>
            </tr>
          ))}
          {showClosing && (
            <>
              <tr>
                <td colSpan={17} style={{ height: 52, ...lineStyle({ left: true }), ...cell }}>
                  합계
                </td>
                <td colSpan={3} style={{ ...lineStyle({}), ...cell }}>
                  {formatHours(closingHours)}시간
                </td>
              </tr>
              {/* 증명 문구 · 발급일 · 발급 기관 · 도장 — 서식 안 마지막 칸 */}
              <tr>
                <td colSpan={COLS} style={{ ...lineStyle({ left: true }), padding: 0 }}>
                  <div
                    style={{
                      position: "relative",
                      height: 210,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 26,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      「정보시스템감리기준」 제15조에 따라 최근 3년간
                      <br />
                      이수한 계속교육임을 증명합니다.
                    </p>
                    <div style={{ fontSize: 16 }}>{issuedOnLabel ?? ""}</div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>(사)정보시스템감리협회장</div>
                    {/* 인감 도장 — 협회 제공 인장 이미지 */}
                    <img
                      src={associationSeal}
                      alt="(사)정보시스템감리협회 인감"
                      style={{
                        position: "absolute",
                        left: "65%",
                        top: "70%",
                        transform: "translateY(-50%)",
                        width: 118,
                        height: 118,
                        // 인감 잉크 — 아래 텍스트가 도장을 비쳐 보이게 (실제 날인과 같은 겹침)
                        mixBlendMode: "multiply",
                      }}
                    />
                  </div>
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {/* 표를 페이지 세로 중앙에 둔다 */}
      <div style={{ flex: 1 }} />
    </div>
  );
}
