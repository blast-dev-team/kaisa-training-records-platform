import associationSeal from "@/src/assets/association-seal.png";
import type { CompletionCertificate } from "@/src/entities/training-record";

/** A4 @96dpi — PDF 1페이지와 1:1 대응 (확인서 시트와 같은 규격) */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

/** 공문서 서체 — 캔버스 렌더는 브라우저가 하므로 시스템 설치 폰트를 그대로 쓴다 */
const DOC_FONT = `"Batang", "바탕", "BatangChe", "AppleMyungjo", serif`;

/** 증명 문구 — 예시 서식 기준. 조항이 다른 버전(제16조제3항)도 있어 상수로 둔다 */
const PROOF_TEXT =
  "위 사람은 「전자정부법」 제60조제1항과 「정보시스템 감리기준」" +
  "\n제14조제2항에 따라 위의 교육과정을 수료하였음을 증명합니다.";

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문 반환 */
function formatKoreanDate(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
}

/** 교육기간 표기 — '2026.09.01 ~ 09.30(24시간)'. 같은 해면 종료일은 월.일만 */
function formatPeriodLabel(
  startedAt: string | null,
  endedAt: string | null,
  hours: number | null,
): string {
  const parts: string[] = [];
  const dot = (value: string) => value.slice(0, 10).replaceAll("-", ".");
  if (startedAt && endedAt) {
    const end =
      startedAt.slice(0, 4) === endedAt.slice(0, 4)
        ? endedAt.slice(5, 10).replaceAll("-", ".")
        : dot(endedAt);
    parts.push(`${dot(startedAt)} ~ ${end}`);
  } else if (startedAt || endedAt) {
    parts.push(dot(startedAt ?? endedAt ?? ""));
  }
  if (hours != null && hours > 0) {
    const label = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
    parts.push(`(${label}시간)`);
  }
  return parts.join("");
}

/** 항목 행 — '○ 성　　명 : 홍길동'. 라벨은 4자 폭으로 패딩해 콜론 위치를 맞춘다 */
function EntryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: 18, lineHeight: 2.2 }}>
      <span style={{ width: 34 }}>○</span>
      <span style={{ width: 96, whiteSpace: "nowrap" }}>{label}</span>
      <span>{value ? `: ${value}` : ""}</span>
    </div>
  );
}

/**
 * 교육수료증 — 내부 기관 수료내역 1건당 1장.
 *
 * PDF 생성(html2canvas-pro)에서 같은 모양을 내기 위해 Tailwind 클래스 없이
 * inline style(px·hex)만 사용한다 (확인서 시트와 같은 규칙).
 */
export function CompletionCertificateSheet({
  certificate,
}: {
  certificate: CompletionCertificate;
}) {
  const issuedOnLabel = formatKoreanDate(certificate.issuedAt);

  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        boxSizing: "border-box",
        padding: "56px 64px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: DOC_FONT,
      }}
    >
      {/* 수료증 번호 — 좌측 상단 */}
      <div style={{ fontSize: 15 }}>수료증 번호 {certificate.certificateNo}</div>

      {/* 제목 */}
      <div
        style={{
          textAlign: "center",
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: 24,
          textIndent: 24,
          margin: "72px 0 96px",
        }}
      >
        교육수료증
      </div>

      {/* 항목 — 라벨은 전각 공백으로 4자 폭을 맞춰 콜론이 정렬된다 */}
      <div style={{ paddingLeft: 24 }}>
        <EntryRow label="성　　명" value={certificate.traineeName ?? ""} />
        <EntryRow label="생년월일" value={formatKoreanDate(certificate.traineeBirthDate)} />
        {certificate.sessionName && <EntryRow label="교육과정" value={certificate.sessionName} />}
        <EntryRow label="교육주제" value={certificate.courseName} />
        <EntryRow
          label="교육기간"
          value={formatPeriodLabel(
            certificate.startedAt,
            certificate.endedAt,
            certificate.completedHours,
          )}
        />
      </div>

      {/* 증명 문구 */}
      <div
        style={{
          margin: "96px 0",
          textAlign: "center",
          fontSize: 19,
          fontWeight: 700,
          lineHeight: 1.8,
          whiteSpace: "pre-line",
        }}
      >
        {PROOF_TEXT}
      </div>

      <div style={{ flex: 1 }} />

      {/* 발급일 · 발급 기관 · 인장 */}
      <div style={{ position: "relative", paddingBottom: 24 }}>
        <div style={{ textAlign: "center", fontSize: 17, marginBottom: 20 }}>{issuedOnLabel}</div>
        <div style={{ textAlign: "center", fontSize: 19, fontWeight: 700, lineHeight: 1.9 }}>
          {certificate.institutionName}
          <br />
          <span style={{ letterSpacing: 16, textIndent: 16, fontSize: 30 }}>회장 조 병 휘</span>
        </div>
        <img
          src={associationSeal}
          alt={`${certificate.institutionName} 인감`}
          style={{
            position: "absolute",
            right: 70,
            bottom: 0,
            width: 118,
            height: 118,
            // 인감 잉크 — 아래 텍스트가 도장을 비쳐 보이게 (실제 날인과 같은 겹침)
            mixBlendMode: "multiply",
          }}
        />
      </div>
    </div>
  );
}
