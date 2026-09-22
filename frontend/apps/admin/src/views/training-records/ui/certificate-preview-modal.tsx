import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { generateCertificatePdf } from "@/src/shared/utils/generate-certificate-pdf";
import { todayYMD } from "@/src/shared/utils/format";
import type { TrainingRecord } from "@/src/entities/training-record";
import {
  CertificateDocumentSheet,
  chunkRows,
  formatIssuedOnLabel,
  ROWS_PER_PAGE,
  toSheetRows,
  type CertificateSheetRow,
} from "./certificate-document-sheet";

/** A4 시트 원본 폭·높이 @96dpi — 미리보기 스케일 계산용 */
const SHEET_WIDTH = 794;
const SHEET_HEIGHT = 1123;
const PREVIEW_SCALE = 0.82;

/** 교육생별 다중 발급 묶음 — 한 교육생의 선택 이력을 한 PDF(페이지 N장)로 */
export interface CertificateDownloadGroup {
  key: string;
  traineeName: string;
  supervisorGrade: string | null;
  supervisorCertNo: string | null;
  formNo: string | null;
  docNo: string | null;
  pages: CertificateSheetRow[][];
  issuedOnLabel: string;
}

/** 선택 이력 → 교육생별 묶음. 머리 표기(등급·서식·문서번호)는 첫 이력 값 */
export function buildDownloadGroups(records: TrainingRecord[]): CertificateDownloadGroup[] {
  const issuedOnLabel = formatIssuedOnLabel(new Date());
  // 이력 행을 교육생별로 전부 모은 뒤 페이지로 나눈다 — 건별로 나누면
  // 한 페이지에 행 1개짜리 페이지가 이력 수만큼 생긴다
  const rowsByTrainee = new Map<
    string,
    Omit<CertificateDownloadGroup, "pages"> & { rows: CertificateSheetRow[] }
  >();
  for (const record of records) {
    let group = rowsByTrainee.get(record.traineeId);
    if (!group) {
      group = {
        key: record.traineeId,
        traineeName: record.traineeName ?? "",
        supervisorGrade: record.supervisorGrade,
        supervisorCertNo: record.supervisorCertNo,
        formNo: record.formNo,
        docNo: record.docNo,
        rows: [],
        issuedOnLabel,
      };
      rowsByTrainee.set(record.traineeId, group);
    }
    group.rows.push(...toSheetRows([record]));
  }
  return [...rowsByTrainee.values()].map(({ rows, ...header }) => ({
    ...header,
    pages: chunkRows(rows),
  }));
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 미리보기 대상 이력들 — 행 액션은 1건, 일괄 발급은 선택 전체 */
  records: TrainingRecord[];
}

/**
 * 확인서 미리보기 모달 — WEB 발급 화면과 같은 서식을 축소 노출.
 * 여러 건이면 교육생별로 묶어 각 교육생이 한 PDF(페이지 N장)가 되고,
 * 전체 다운로드는 교육생 수만큼 파일을 저장한다.
 *
 * 실제 PDF는 숨은 컨테이너의 원본 크기 시트를 캔버스로 래스터화해 만든다
 * (transform 스케일이 걸린 노드는 캡처가 어긋난다).
 */
export function CertificatePreviewModal({ isOpen, onClose, records }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const groups = isOpen ? buildDownloadGroups(records) : [];
  const recordCount = records.length;
  const issuedOnLabel = formatIssuedOnLabel(new Date());

  const handleDownloadAll = async () => {
    const container = captureRef.current;
    if (!container) return;
    setIsDownloading(true);
    try {
      for (const group of groups) {
        const els = Array.from(
          container.querySelectorAll<HTMLElement>(`[data-group="${group.key}"] [data-sheet-page]`),
        );
        if (els.length === 0) continue;
        await generateCertificatePdf(
          els,
          `계속교육내역확인서_${group.traineeName || group.key}_${todayYMD()}.pdf`,
        );
      }
      toast.success(
        groups.length > 1 ? `확인서 ${groups.length}개 파일을 저장했어요` : "PDF를 저장했어요",
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 생성에 실패했어요");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="확인서 미리보기"
        description={
          groups.length > 1
            ? `${groups.length}명의 감리원 · 내역 ${recordCount}건 — 감리원별 PDF로 저장돼요`
            : groups[0]
              ? `${groups[0].traineeName || "감리원"} · 내역 ${recordCount}건`
              : undefined
        }
        size="xl"
        actions={[
          { label: "닫기", onClick: onClose },
          {
            label: groups.length > 1 ? "전체 다운로드" : "PDF 다운로드",
            variant: "primary",
            isLoading: isDownloading,
            onClick: handleDownloadAll,
          },
        ]}
      >
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-bg p-4">
          {groups.map((group) => (
            <section key={group.key} className="mb-6 last:mb-0">
              {groups.length > 1 && (
                <h3 className="mb-2 text-[13px] font-medium text-ink">
                  {group.traineeName || "감리원"} · {group.pages.length}페이지
                </h3>
              )}
              <div
                style={{
                  width: SHEET_WIDTH * PREVIEW_SCALE,
                  height: SHEET_HEIGHT * PREVIEW_SCALE * group.pages.length,
                  position: "relative",
                  margin: "0 auto",
                }}
              >
                {group.pages.map((pageRows, pageIndex) => (
                  <div
                    key={pageIndex}
                    style={{
                      position: "absolute",
                      top: SHEET_HEIGHT * PREVIEW_SCALE * pageIndex,
                      left: 0,
                      width: SHEET_WIDTH * PREVIEW_SCALE,
                      height: SHEET_HEIGHT * PREVIEW_SCALE,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${PREVIEW_SCALE})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <CertificateDocumentSheet
                        memberName={group.traineeName}
                        supervisorGrade={group.supervisorGrade}
                        supervisorCertNo={group.supervisorCertNo}
                        formNo={group.formNo}
                        docNo={group.docNo}
                        rows={pageRows}
                        startNo={pageIndex * ROWS_PER_PAGE + 1}
                        issuedOnLabel={group.issuedOnLabel}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Dialog>

      {/* 캡처 전용 원본 크기 시트 — 화면 밖에 두고 PDF 생성에만 쓴다 */}
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0 }} ref={captureRef}>
        {isOpen &&
          groups.map((group) => (
            <div key={group.key} data-group={group.key}>
              {group.pages.map((pageRows, pageIndex) => (
                <div key={pageIndex} data-sheet-page>
                  <CertificateDocumentSheet
                    memberName={group.traineeName}
                    supervisorGrade={group.supervisorGrade}
                    supervisorCertNo={group.supervisorCertNo}
                    formNo={group.formNo}
                    docNo={group.docNo}
                    rows={pageRows}
                    startNo={pageIndex * ROWS_PER_PAGE + 1}
                    issuedOnLabel={group.issuedOnLabel}
                  />
                </div>
              ))}
            </div>
          ))}
      </div>
    </>
  );
}
