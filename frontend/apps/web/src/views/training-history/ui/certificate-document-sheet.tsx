import type { CSSProperties } from "react";

import associationSeal from "@/src/assets/association-seal.png";
import type { TrainingHistoryDetail } from "../api/get-training-history-detail";

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

/** 발급 대상 이력 → 서식 행 스냅샷 (ADMIN 상세와 같은 매핑) */
export function toSheetRows(details: TrainingHistoryDetail[]): CertificateSheetRow[] {
  return details.map((detail) => ({
    institutionName: detail.institutionName ?? null,
    courseName: detail.courseName,
    trainedOn: detail.trainedOn,
    hours: detail.hours,
  }));
}

/** 서식 행 용량 — 실측: 고정부(제목 96+신청인 48×2+섹션 48+헤더 48)=288px.
 * 모든 페이지 하단에 확인서 번호가 들어가므로 각 용량은 번호 줄(~17px)을 뺀 값.
 * 1페이지(머리만, 마감 없음): (1051 − 17 − 288) / 64 = 11.6 → 10행.
 * 11행도 계산상 들어오지만 하단이 빠듯해 여유를 둔다 */
export const ROWS_PER_FIRST_PAGE = 10;
/** 계속 페이지(행만): 번호 줄 빼면 (1051 − 17) / 64 = 16 → 4줄 이름 여유로 15 */
export const ROWS_PER_CONT_PAGE = 15;
/** 마지막 페이지 — 마감 블록 실측 263px(합계 52 + 증명 211) + 번호 줄(~17px). 머리 없음.
 * (1051 − 263 − 17) / 64 = 12.05 → 12행도 계산상 들어오지만 하단 3px 여백은
 * 레스터화 오차에 잘리고, 11행으로 두면 67px 여유가 남는다 */
export const ROWS_PER_LAST_PAGE = 11;
/** 단일 페이지(7행 이하 문서) — 머리 288px + 마감 263px 이 같은 장에 들어간다.
 * (1051 − 288 − 263 − 17) / 64 = 7.55 → 7행. LAST_PAGE(머리 없음)와 다른 용량이라
 * 분리하지 않으면 빈 행 채움이 11행까지 가서 증명·도장이 페이지 밖으로 잘린다 */
export const ROWS_PER_SINGLE_PAGE = 7;

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
 * 7행 이하는 한 장(머리+마감), 넘으면 1페이지에 머리+행만 최대 10행 담고 행은
 * 계속 페이지로 이어진다. 계속 페이지는 데이터 행을 용량(15행)까지 채우고 남는
 * 칸은 빈 행으로 마무리한다(공백 서식과 같은 모양). 마지막 페이지 용량(11행)을
 * 넘는 몫을 마지막 페이지에 억지로 맞추지 않는다 — 넘치면 마감(합계·증명·인감)만
 * 있는 장으로 간다. 20행 문서가 11/2/7 처럼 계속 페이지에 2행만 남던 사례의 교정.
 */
export function paginateRows(rows: CertificateSheetRow[]): CertificateSheetPage[] {
  if (rows.length <= ROWS_PER_SINGLE_PAGE) {
    // 단일 문서는 1장을 가득 채운다 — 남는 칸은 빈 행(공백 서식과 같은 모양).
    // 머리+마감이 같은 장이라 용량은 SINGLE_PAGE(7행)를 쓴다
    return [
      {
        rows: [...rows, ...Array.from({ length: ROWS_PER_SINGLE_PAGE - rows.length }, () => null)],
        startNo: 1,
        showHead: true,
        showClosing: true,
      },
    ];
  }

  // 남은 행이 없으면 마감만 있는 장이 마무리한다 — 1행을 억지로 남기지 않는다
  const firstCount = Math.min(ROWS_PER_FIRST_PAGE, rows.length);
  const pages: CertificateSheetPage[] = [
    { rows: rows.slice(0, firstCount), startNo: 1, showHead: true, showClosing: false },
  ];

  let startNo = 1 + firstCount;
  let rest = rows.slice(firstCount);

  // 계속 페이지 — 마지막 페이지 용량(7행)을 넘는 몫을 전부 가져가고 빈 행으로 채운다
  while (rest.length > ROWS_PER_LAST_PAGE) {
    const take = Math.min(ROWS_PER_CONT_PAGE, rest.length);
    pages.push({
      rows: [
        ...rest.slice(0, take),
        ...Array.from({ length: ROWS_PER_CONT_PAGE - take }, () => null),
      ],
      startNo,
      showHead: false,
      showClosing: false,
    });
    startNo += take;
    rest = rest.slice(take);
  }

  // 마지막 페이지 — 남은 행(최대 7행)과 마감. 남은 행이 없으면 마감만 있는 장
  pages.push({ rows: rest, startNo, showHead: false, showClosing: true });
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
  /** 신청인 성명 (auth store 이름 — " 님" 접미 제거한 값) */
  memberName: string;
  /** 감리원 등급 — 신청인 칸 표기 */
  supervisorGrade?: string;
  /** 감리원증 발급번호 — 신청인 칸 표기 */
  supervisorCertNo?: string;
  /** 서식번호 (예: 제31호) — 좌측 상단 표기 */
  formNo?: string;
  /** 문서번호 — 우측 상단 표기 */
  docNo?: string;
  /** 발급일 표시문 (예: 2026년 7월 23일) */
  issuedOnLabel?: string;
  /** 확인서 번호 — 하단 진위확인용 표기 (묶음 확인서 번호) */
  certificateNumber?: string;
  /** 이 페이지 첫 행의 연번 (2페이지부터 이어지는 번호) */
  startNo?: number;
  /** 현재 페이지 번호 — 하단 우측 "현재 / 총쪽" 표기. 미리보기 연속 렌더는 생략 */
  pageNo?: number;
  /** 문서 총 페이지 수 — pageNo 와 함께 전달 */
  pageCount?: number;
  /**
   * 연속 렌더 — A4 한 장 높이에 묶지 않고 행을 모두 보여준다(세로 중앙 정렬·
   * 페이지 여백 스페이서 없음, 높이 자동). 미리보기에서 같은 문서의 여러 페이지를
   * 여백 없이 이어 보여줄 때 쓴다. PDF는 페이지 분할이 필요해서 이 모드를 쓰지 않는다.
   */
  continuous?: boolean;
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
 * 선택한 교육 건 여러 건을 한 문서의 교육내역 행으로 합쳐 담는다(묶음 확인서).
 * 행이 용량을 넘으면 paginateRows가 계속 페이지로 나눠 연번을 이어주고,
 * 합계·증명·인감은 마지막 페이지에만 온다(협회 발급 문서와 같은 연속 문서).
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
  certificateNumber,
  startNo = 1,
  pageNo,
  pageCount,
  continuous = false,
}: CertificateDocumentSheetProps) {
  // 마감 합계는 문서 전체 합계 — 페이지 합이 아니다. prop이 없으면(단일 페이지) rows 합
  const closingHours = documentTotalHours ?? rows.reduce((sum, row) => sum + (row?.hours ?? 0), 0);

  return (
    <div
      style={{
        width: PAGE_WIDTH,
        // 연속 렌더는 내용 높이를 따른다 — A4 한 장에 묶지 않는다
        height: continuous ? "auto" : PAGE_HEIGHT,
        boxSizing: "border-box",
        position: "relative",
        padding: "36px 47px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: DOC_FONT,
      }}
    >
      {/* 표를 페이지 세로 중앙에 배치 — 위아래 스페이서 대칭. 계속 페이지는 상단 정렬.
          연속 렌더는 중앙 정렬 없이 머리부터 바로 시작한다 */}
      {showHead && !continuous && <div style={{ flex: 1 }} />}

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
          {/* 표 최상단 외곽선 — html2canvas-pro 가 여러 셀로 된 첫 행의 borderTop 을
              래스터에서 빠뜨린다(단일 셀 colSpan=20 은 정상 렌더 — 1페이지 제목칸 확인).
              머리 없는 페이지(계속·마감 장)는 1px 선 행으로 최상단을 그린다 */}
          {!showHead && (
            <tr>
              <td
                colSpan={COLS}
                style={{ height: 0, padding: 0, fontSize: 0, lineHeight: 0, borderTop: LINE }}
              />
            </tr>
          )}
          {rows.map((row, index) => (
            <tr key={index}>
              <td
                colSpan={2}
                style={{
                  height: 64,
                  ...lineStyle({ left: true }),
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
                {/* 마감만 있는 장(데이터 0행)은 합계 행이 표의 최상단이라 윗선을 그려야 한다 —
                    데이터 행이 있으면 바로 위 행의 아랫선이 경계를 그린다 */}
                {/* 마감만 있는 장도 위의 1px 선 행이 최상단을 그린다 */}
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

      {/* 표를 페이지 세로 중앙에 두고, 확인서 번호·페이지 번호·간인천공은 하단 여백에 고정.
          연속 렌더는 고정 높이가 없어 스페이서 대신 여백 하나로 마무리한다 */}
      {!continuous && <div style={{ flex: 1 }} />}
      {certificateNumber && pageNo == null && (
        <div style={{ textAlign: "center", fontSize: 12, marginTop: continuous ? 24 : 0 }}>
          확인서 번호: {certificateNumber}
        </div>
      )}
      {pageNo != null && (
        // 확인서 번호(좌) · 페이지 번호(우) 한 줄 — 기존 한 줄 높이 그대로라 페이지 배치가 밀리지 않는다
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            marginTop: continuous ? 24 : 0,
          }}
        >
          <span>{certificateNumber ? `확인서 번호: ${certificateNumber}` : " "}</span>
          <span>
            {pageNo} / {pageCount}
          </span>
        </div>
      )}
    </div>
  );
}
