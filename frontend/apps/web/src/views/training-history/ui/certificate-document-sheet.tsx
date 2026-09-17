import type { CSSProperties } from "react";

import type { TrainingHistoryDetail } from "../api/get-training-history-detail";

export interface CertificateDocumentSheetProps {
  /** 발급 대상 교육이력 — 표기 필드(formNo·docNo·감리원 정보) 포함 */
  detail: TrainingHistoryDetail;
  /** 신청인 성명 (auth store 이름 — " 님" 접미 제거한 값) */
  memberName: string;
  /** 발급일 표시문 (예: 2026년 7월 23일) */
  issuedOnLabel?: string;
  /** 확인서 번호 — 하단 진위확인용 표기 */
  certificateNumber?: string;
}

const LINE = "1px solid #000";
const STAMP_RED = "rgba(196, 30, 30, 0.78)";

/** A4 @96dpi — PDF 1페이지와 1:1 대응 */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const CONTENT_WIDTH = 700;

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

/**
 * 계속교육내역 확인서 — 별지 제31호 서식 레이아웃.
 *
 * PDF 생성(html2canvas-pro)과 인쇄 양쪽에서 같은 모양을 내기 위해
 * Tailwind 클래스 없이 inline style(px·hex)만 사용한다.
 */
export function CertificateDocumentSheet({
  detail,
  memberName,
  issuedOnLabel,
  certificateNumber,
}: CertificateDocumentSheetProps) {
  const period = detail.trainedOn.replaceAll("-", ".");
  const hours = String(detail.hours);

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
        <span>[별지] {detail.formNo ?? ""} 서식</span>
        <span>{detail.docNo ?? ""}</span>
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
              {detail.supervisorGrade ?? ""}
            </td>
            <td colSpan={5} style={{ border: LINE, ...cell, fontSize: 14 }}>
              감리원증 발급번호
            </td>
            <td colSpan={7} style={{ border: LINE, ...cell, fontSize: 14 }}>
              {detail.supervisorCertNo ?? ""}
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
          <tr>
            <td colSpan={2} style={{ border: LINE, height: 72, ...cell }}>1</td>
            <td colSpan={4} style={{ border: LINE, ...cell, fontSize: 14 }}>
              {detail.institutionName ?? ""}
            </td>
            <td colSpan={8} style={{ border: LINE, ...cell, fontSize: 14 }}>
              {detail.courseName}
            </td>
            <td colSpan={3} style={{ border: LINE, ...cell }}>{period}</td>
            <td colSpan={3} style={{ border: LINE, ...cell }}>{hours}시간</td>
          </tr>
          {/* 서식 높이 유지용 빈 행 — 열 구분선을 유지한다 */}
          {[0, 1, 2, 3].map((row) => (
            <tr key={row}>
              <td colSpan={2} style={{ border: LINE, height: 72 }} />
              <td colSpan={4} style={{ border: LINE }} />
              <td colSpan={8} style={{ border: LINE }} />
              <td colSpan={3} style={{ border: LINE }} />
              <td colSpan={3} style={{ border: LINE }} />
            </tr>
          ))}
          <tr>
            <td colSpan={17} style={{ border: LINE, height: 52, ...cell }}>
              합계
            </td>
            <td colSpan={3} style={{ border: LINE, ...cell }}>{hours}시간</td>
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
                {/* 도장 — 실제 인감 에셋을 받으면 이 자리를 <img>로 교체 */}
                <div
                  style={{
                    position: "absolute",
                    left: "59%",
                    top: "58%",
                    transform: "translateY(-50%) rotate(-12deg)",
                    width: 106,
                    height: 106,
                    borderRadius: "50%",
                    border: `3px solid ${STAMP_RED}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: STAMP_RED,
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                    lineHeight: 1.35,
                  }}
                >
                  (사)정보시스템
                  <br />
                  감리협회
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 표를 페이지 세로 중앙에 두고, 확인서 번호만 하단에 고정한다 */}
      <div style={{ flex: 1 }} />
      {certificateNumber && (
        <div style={{ textAlign: "center", fontSize: 12 }}>
          확인서 번호: {certificateNumber}
        </div>
      )}
    </div>
  );
}
