import type { CSSProperties } from "react";

import associationSeal from "@/src/assets/association-seal.png";

/** 이력 행 → 서식 행 스냅샷 (WEB 상세와 같은 매핑 — 시간은 total_hours 기준) */
export function toSheetRows(records: { institutionName: string | null; courseName: string; startedAt: string | null; endedAt: string | null; totalHours: number | null; completedHours: number | null }[]): CertificateSheetRow[] {
  return records.map((record) => ({
    institutionName: record.institutionName,
    courseName: record.courseName,
    trainedOn: record.startedAt ?? record.endedAt ?? "",
    hours: record.totalHours ?? record.completedHours ?? 0,
  }));
}

/** 서식 행을 페이지(5건) 단위로 나눈다 */
export function chunkRows(rows: CertificateSheetRow[]): CertificateSheetRow[][] {
  const pages: CertificateSheetRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
}

/** 발급일 표시문 — 2026년 9월 21일 */
export function formatIssuedOnLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 계속교육내역 확인서 — 별지 제31호 서식 레이아웃.
 *
 * WEB 앱(web/src/views/training-history/ui/certificate-document-sheet.tsx)과
 * 같은 서식. 차이는 교육내역 행을 여러 건 받는 것(어드민 교육생별 다중 발급용) —
 * WEB은 발급이 이력 1건 단위라 행 1개만 채운다.
 *
 * PDF 생성(html2canvas-pro)과 화면 미리보기 양쪽에서 같은 모양을 내기 위해
 * Tailwind 클래스 없이 inline style(px·hex)만 사용한다.
 */

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

export interface CertificateDocumentSheetProps {
  /** 신청인 — 교육생 성명 */
  memberName: string;
  /** 감리원 등급 — 신청인 칸 표기 */
  supervisorGrade?: string | null;
  /** 감리원증 발급번호 — 신청인 칸 표기 */
  supervisorCertNo?: string | null;
  /** 교육내역 행 — 페이지당 최대 ROWS_PER_PAGE 건 */
  rows: CertificateSheetRow[];
  /** 이 페이지 첫 행의 연번 (2페이지부터 이어지는 번호) */
  startNo?: number;
  /** 서식번호 (예: 제31호) — 좌측 상단 표기 */
  formNo?: string | null;
  /** 문서번호 — 우측 상단 표기 */
  docNo?: string | null;
  /** 발급일 표시문 (예: 2026년 9월 21일) */
  issuedOnLabel?: string;
}

const LINE = "1px solid #000";

/** A4 @96dpi — PDF 1페이지와 1:1 대응 */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const CONTENT_WIDTH = 700;

/** 서식 고정 행이 5칸 — 5건까지만 한 페이지에, 넘으면 다음 페이지 */
export const ROWS_PER_PAGE = 5;

/**
 * 표 폭을 35px 기본 칸 20개로 쪼개 각 행을 colSpan 조합으로 구성한다.
 * 행마다 칸 경계가 어긋나는 그리드를 단일 table(border-collapse: collapse)로
 * 그리기 위함 — 중첩 테이블을 쓰면 경계선이 겹쳐 두꺼워진다.
 */
const COLS = 20;

/** 공문서 서체 — 캔버스 렌더는 브라우저가 하므로 시스템 설치 폰트를 그대로 쓴다 */
const DOC_FONT = `"Batang", "바탕", "BatangChe", "AppleMyungjo", serif`;

const cell: CSSProperties = {
  textAlign: "center",
  verticalAlign: "middle",
  padding: "0 8px",
};

/** 시간 합계 표기 — 8.0 → "8", 7.5 → "7.5" */
function formatHours(hours: number): string {
  return String(Number.isInteger(hours) ? hours : Number(hours.toFixed(1)));
}

export function CertificateDocumentSheet({
  memberName,
  supervisorGrade,
  supervisorCertNo,
  rows,
  startNo = 1,
  formNo,
  docNo,
  issuedOnLabel,
}: CertificateDocumentSheetProps) {
  // 서식 행 고정 — 부족하면 빈 행으로 채워 레이아웃을 유지한다
  const paddedRows: (CertificateSheetRow | null)[] = [...rows];
  while (paddedRows.length < ROWS_PER_PAGE) paddedRows.push(null);

  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);

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
      {/* 표를 페이지 세로 중앙에 배치 — 위아래 스페이서 대칭 */}
      <div style={{ flex: 1 }} />

      {/* 서식·문서번호 — 표 바깥 상단. 표와 함께 세로 중앙에 배치된다 */}
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

      <table
        style={{
          width: CONTENT_WIDTH,
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          {Array.from({ length: COLS }, (_, index) => (
            <col key={index} style={{ width: CONTENT_WIDTH / COLS }} />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={COLS} style={{ border: LINE, height: 96, ...cell }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6 }}>
                계속교육내역 확인서
              </span>
            </td>
          </tr>
          <tr>
            <td colSpan={3} style={{ border: LINE, height: 48, ...cell, fontSize: 14 }}>
              신청인
            </td>
            <td colSpan={3} style={{ border: LINE, ...cell, fontSize: 14 }}>
              성&nbsp;&nbsp;명
            </td>
            <td colSpan={14} style={{ border: LINE, ...cell, fontSize: 14 }}>
              {memberName}
            </td>
          </tr>
          <tr>
            <td colSpan={3} style={{ border: LINE, height: 48, ...cell, fontSize: 14 }}>
              감리원 등급
            </td>
            <td colSpan={5} style={{ border: LINE, ...cell, fontSize: 14 }}>
              {supervisorGrade ?? ""}
            </td>
            <td colSpan={5} style={{ border: LINE, ...cell, fontSize: 14 }}>
              감리원증 발급번호
            </td>
            <td colSpan={7} style={{ border: LINE, ...cell, fontSize: 14 }}>
              {supervisorCertNo ?? ""}
            </td>
          </tr>
          <tr>
            <td colSpan={COLS} style={{ border: LINE, height: 48, ...cell, fontSize: 15 }}>
              계속교육내역 (최근 3년간)
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ border: LINE, height: 48, ...cell, fontSize: 15 }}>
              연번
            </td>
            <td colSpan={4} style={{ border: LINE, ...cell, fontSize: 15 }}>
              교육기관명
            </td>
            <td colSpan={8} style={{ border: LINE, ...cell, fontSize: 15 }}>
              교육명
            </td>
            <td colSpan={3} style={{ border: LINE, ...cell, fontSize: 15 }}>
              교육기간
            </td>
            <td colSpan={3} style={{ border: LINE, ...cell, fontSize: 15 }}>
              교육시간
            </td>
          </tr>
          {paddedRows.map((row, index) => (
            <tr key={index}>
              <td colSpan={2} style={{ border: LINE, height: 72, ...cell }}>
                {row ? startNo + index : ""}
              </td>
              <td colSpan={4} style={{ border: LINE, ...cell, fontSize: 14 }}>
                {row?.institutionName ?? ""}
              </td>
              <td colSpan={8} style={{ border: LINE, ...cell, fontSize: 14 }}>
                {row?.courseName ?? ""}
              </td>
              <td colSpan={3} style={{ border: LINE, ...cell }}>
                {row ? row.trainedOn.replaceAll("-", ".") : ""}
              </td>
              <td colSpan={3} style={{ border: LINE, ...cell }}>
                {row ? `${formatHours(row.hours)}시간` : ""}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={17} style={{ border: LINE, height: 52, ...cell }}>
              합계
            </td>
            <td colSpan={3} style={{ border: LINE, ...cell }}>
              {formatHours(totalHours)}시간
            </td>
          </tr>
          {/* 증명 문구 · 발급일 · 발급 기관 · 도장 — 서식 안 마지막 칸 */}
          <tr>
            <td colSpan={COLS} style={{ border: LINE, padding: 0 }}>
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
                <div style={{ fontSize: 16, paddingLeft: 170 }}>
                  {issuedOnLabel ?? ""}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  (사)정보시스템감리협회장
                </div>
                {/* 인감 도장 — 협회 제공 인장 이미지 */}
                <img
                  src={associationSeal}
                  alt="(사)정보시스템감리협회 인감"
                  style={{
                    position: "absolute",
                    left: "59%",
                    top: "58%",
                    transform: "translateY(-50%) rotate(-12deg)",
                    width: 118,
                    height: 118,
                    // 인감 잉크 — 아래 텍스트가 도장을 비쳐 보이게 (실제 날인과 같은 겹침)
                    mixBlendMode: "multiply",
                  }}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 표를 페이지 세로 중앙에 둔다 */}
      <div style={{ flex: 1 }} />
    </div>
  );
}
